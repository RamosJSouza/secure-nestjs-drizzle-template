# VULN-02 — Race condition na revogação do JTI no Redis durante `refresh`

**Severidade:** ALTA
**CVSS 3.1 (estimado):** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L)
**CWE-362:** Race Condition / **CWE-754:** Improper Check for Unusual or Exceptional Conditions / **CWE-770:** Allocation of Resources Without Limits
**Ficheiro:** `src/auth/auth.service.ts:308-358` (especificamente 347-351)

---

## 1. Evidência irrefutável (código atual)

### 1.1 A revogação do JTI do access token antigo é *fire-and-forget* e o erro é silenciado

```345:358:src/auth/auth.service.ts
    if (claimed.expiresAt < now) throw new UnauthorizedException('Refresh token expired');

    if (claimed.accessTokenJti) {
      this.tokenRevocationService
        .revokeToken(claimed.accessTokenJti, TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS)
        .catch(() => undefined);
    }

    const user = await this.usersService.findById(claimed.userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');
    if (user.lockedUntil && user.lockedUntil > now) throw new UnauthorizedException('Account is locked.');

    return this.createTokensAndSession(user as User, ip, userAgent, claimed.id);
```

Dois defeitos concentrados:

1. **`revokeToken(...)` NÃO é aguardado** (sem `await`). A Promise flutua. O fluxo continua imediatamente para `findById` e `createTokensAndSession`, e **os novos tokens são devolvidos ao cliente ANTES** de o `jti` antigo estar escrito no Redis.
2. **`.catch(() => undefined)` silencia qualquer erro** — sem log, sem métrica, sem retry.

### 1.2 `revokeToken` foi desenhado para **relançar** em caso de falha

```43:52:src/security/token-revocation/token-revocation.service.ts
  async revokeToken(jti: string, ttlSeconds: number): Promise<void> {
    const key = this.buildKey(jti);
    try {
      await this.cacheManager.set(key, '1', ttlSeconds * 1000); // cache-manager uses ms
    } catch (err) {
      this.logger.error(`Failed to revoke JTI ${jti}: ${(err as Error).message}`);
      // Re-throw: revocation failure is security-critical; callers decide whether to proceed
      throw err;
    }
  }
```

O contrato do serviço é explícito: *"revocation failure is security-critical; callers decide whether to proceed"*. O `refresh()` **decide silenciosamente prosseguir**, violando o contrato.

### 1.3 Inconsistência com os outros caminhos de revogação (prova que é um bug, não uma decisão)

Todos os outros caminhos **aguardam** `revokeMany`:

```275:279:src/auth/auth.service.ts
      if (jtis.length > 0) {
        await this.tokenRevocationService
          .revokeMany(jtis, TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS)
          .catch(() => undefined);
      }
```
- `login` (risco crítico) — linhas 275-279: **`await`**.
- `enforceSessionLimit` — linhas 188-192: **`await`**.
- `revokeSessionFamilyAndLogReuse` — linhas 147-153: **`await`**.
- `changePassword` — linhas 483-489: **`await`**.
- `logout` — linhas 382-391: **`await`**.

**Apenas** o `refresh()` usa `revokeToken` (singular) **sem `await`**. É a inconsistência que confirma o defeito.

### 1.4 `isRevoked` falha OPEN + `DISABLE_REDIS=true` por defeito

```72:83:src/security/token-revocation/token-revocation.service.ts
  async isRevoked(jti: string): Promise<boolean> {
    const key = this.buildKey(jti);
    try {
      const value = await this.cacheManager.get<string>(key);
      return value !== null && value !== undefined;
    } catch (err) {
      this.logger.warn(
        `JTI revocation check failed (Redis unavailable) — failing OPEN: ${(err as Error).message}`,
      );
      return false; // fail OPEN: prefer availability over strict revocation during Redis outage
    }
  }
```

Combinado com `.env.example:40` (`DISABLE_REDIS=true`), num ambiente sem Redis:
- `revokeToken` lança → `.catch(() => undefined)` traga → `jti` **nunca** escrito.
- `isRevoked(jti)` lança → retorna `false` → token **sempre aceite**.

→ O access token antigo **permanece válido pelo TTL completo de 15 minutos** após o refresh, **sem qualquer registo**.

---

## 2. Modelo de Ameaça tático

**Atacante:** entidade que obteve **simultaneamente** o access token (`A0`, jti=`J0`) e o refresh token (`R0`) da vítima — cenário realista em XSS, roubo de `localStorage`, proxy de debugging, etc.

**Limite de confiança comprometido:** o *Revocation Boundary* (Redis). O `refresh()` entrega novos tokens antes de concluir a revogação do `J0`, quebrando a garantia de "rotação atómica" que o resto do código pretende dar (a cláusula `UPDATE ... WHERE revokedAt IS NULL` é atómica no DB, **mas a revogação do access token stateless não é**).

**Cadeia de exploração:**

1. **Aquisição:** atacante tem `A0` (jti `J0`) e `R0`.
2. **Trigger de rotação:** o atacante (ou a própria vítima) chama `POST /auth/refresh` com `R0`. O servidor:
   - marca a sessão como revogada (DB, atómico);
   - dispara `revokeToken(J0)` **sem aguardar**;
   - emite `A1` (jti `J1`) e `R1`;
   - **devolve `A1`+`R1`**.
3. **Janela de raça:** entre o `return` e o `cacheManager.set('revoked:jti:J0', '1')` efetivo no Redis, `J0` **não está** na revocation list. Qualquer pedido com `Authorization: Bearer A0` passa `isRevoked(J0) === false` → **autenticado**.
4. **Caso Redis indisponível (default `DISABLE_REDIS=true`):** `revokeToken(J0)` **rejeita** → `.catch(() => undefined)` traga → `J0` **nunca** é revogado → `A0` válido pelos **15 minutos** inteiros, sem log.
5. **Impacto:** o atacante opera com **dois** access tokens simultâneos (`A0` e `A1`) durante a janela/TTL. Mesmo que a vítima rode o refresh (esperando invalidar `A0`), o atacante retém `A0`.

**Boundary comprometido (resumo):**
- DB session boundary: **mantido** (a cláusula atómica impede dupla rotação).
- Stateless access-token boundary: **comprometido** (a revogação é assíncrona, best-effort, e silenciada).

---

## 3. Prova de Conceito

Ficheiro: `poc-vuln-02.py`. Demonstração:

1. Login → `A0` (jti `J0`) + `R0`.
2. Validar que `A0` funciona num endpoint protegido.
3. Disparar `POST /auth/refresh` com `R0` → obter `A1` + `R1`.
4. **Imediatamente** voltar a usar `A0` (o token "antigo") no mesmo endpoint protegido, em ciclo rápido (race). Com a vulnerabilidade, `A0` **continua aceite** durante a janela (ou pelos 15 min se Redis estiver em baixo).
5. Reportar quantos pedidos com `A0` foram aceite **depois** da rotação — o esperado seguro é **0**.

curl (race simples):

```bash
RESP=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"victim@example.com","password":"..."}')
A0=$(echo "$RESP" | jq -r .access_token)
R0=$(echo "$RESP" | jq -r .refresh_token)

# Rotação
curl -s -X POST http://localhost:3000/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$R0\"}" > /dev/null

# Imediatamente, tentar usar o ACCESS TOKEN ANTigo (A0) num endpoint protegido
curl -i -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $A0" -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$R0\"}"
# Esperado (seguro): 401 (J0 revogado)
# Real (vulneravel):  204  <-- A0 continua aceite (janela de raca / Redis baixo)
```

---

## 4. Patch de remediação idiomático NestJS

### 4.1 Aguardar a revogação, não silenciar o erro, revogar ANTES de emitir novos tokens

Substituir o bloco das linhas 347-351 por:

```ts
if (claimed.accessTokenJti) {
  try {
    await this.tokenRevocationService.revokeToken(
      claimed.accessTokenJti,
      TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS,
    );
  } catch (err) {
    // Falha de revogacao é security-critical: NÃO prosseguir com a rotação.
    // Reverter o claim da sessao para permitir retry do cliente com o mesmo R.
    this.logger.error(
      `JTI revocation failed during refresh for user ${claimed.userId}: ${(err as Error).message}`,
    );
    await this.db
      .update(sessions)
      .set({ revokedAt: null })
      .where(eq(sessions.id, claimed.id))
      .catch(() => undefined);
    throw new HttpException(
      'Unable to complete token rotation. Please retry.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

const user = await this.usersService.findById(claimed.userId);
// ... resto inalterado
```

### 4.2 Alternativa preferida: revogar em lote com `revokeMany` (consistente com os outros caminhos) e em paralelo com a lookup do user

```ts
const userPromise = this.usersService.findById(claimed.userId);

if (claimed.accessTokenJti) {
  // revokeMany recolhe falhas sem as ocultar silenciosamente.
  await this.tokenRevocationService.revokeMany(
    [claimed.accessTokenJti],
    TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS,
  );
}

const user = await userPromise;
if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');
```

> Em `revokeMany` atual, as falhas são **logueadas** (linhas 62-65 do serviço). Ainda assim, considere tornar `revokeMany` **fail-closed** quando chamado em contexto de rotação (a decisão é do caller). O importante: **`await`** + **log** + **ordem antes do return**.

### 4.3 Endurecer `revokeMany` para propagar falhas críticas (opcional, defense-in-depth)

```ts
// token-revocation.service.ts
async revokeMany(jtis: string[], ttlSeconds: number, failClosed = false): Promise<void> {
  const results = await Promise.allSettled(jtis.map((j) => this.revokeToken(j, ttlSeconds)));
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    this.logger.error(`${failures.length}/${jtis.length} JTI revocations failed`);
    if (failClosed) {
      throw new Error(`${failures.length} JTI revocations failed (failClosed)`);
    }
  }
}
```

### 4.4 Garantias do patch

- **Atomicidade efetiva:** o access token antigo está revogado no Redis **antes** de os novos tokens serem devolvidos.
- **Sem silenciamento:** falhas de Redis são logadas e, no caminho de refresh, **bloqueiam** a rotação (fail-closed) em vez de prosseguirem em silêncio.
- **Consistência:** o `refresh()` passa a usar o mesmo padrão `await ... revokeMany(...)` dos outros 5 caminhos.
- **Reversibilidade:** em caso de falha, o claim da sessão é revertido para o cliente poder tentar novamente com o mesmo refresh token (em vez de o consumir sem emitir novos tokens).
