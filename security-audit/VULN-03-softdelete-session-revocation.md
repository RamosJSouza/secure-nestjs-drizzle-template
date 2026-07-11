# VULN-03 — `UsersService.remove()` (soft-delete) não revoga sessões nem JTIs

**Severidade:** MÉDIA-ALTA (latent → activável por reactivação; amplifica VULN-01 e VULN-02)
**CWE-384:** Session Fixation / **CWE-613:** Insufficient Session Expiration / **CWE-862:** Missing Authorization (isolation)
**Ficheiro:** `src/users/users.service.ts:135-140`

---

## 1. Evidência irrefutável (código atual)

### 1.1 O soft-delete toca **apenas** a linha do utilizador

```135:140:src/users/users.service.ts
  async remove(id: string): Promise<void> {
    await this.dbService.db
      .update(users)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(users.id, id));
  }
```

**O que NÃO é feito:**
- ❌ Revogar as sessões do utilizador (`UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL`).
- ❌ Adicionar os `accessTokenJti` das sessões ativas à revocation list do Redis.
- ❌ Adicionar os refresh tokens (ou os seus `jti`, quando existirem — ver VULN-01) a qualquer blocklist.
- ❌ Usar transação que garanta atomicidade entre o soft-delete e a revogação de credenciais.

### 1.2 As sessões permanecem vivas na base de dados

O schema (`sessions.schema.ts:4-37`) tem `revokedAt timestamp` e `accessTokenJti text`. O `remove()` não os toca. Após o soft-delete, **todas as sessões pré-existentes continuam com `revokedAt = null`**.

### 1.3 A mitigation atual é um **único** check por pedido — defense-in-depth quebrada

A **única** barreira que impede um utilizador soft-deleted de renovar/usar tokens é a lookup do utilizador em cada pedido:

```32:36:src/auth/strategy/jwt.strategy.ts
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }
```

`findById` filtra `isNull(users.deletedAt)` (`users.service.ts:81`). Por isso, **hoje**, um utilizador soft-deleted é bloqueado. **Mas**:

- Não há transação entre `remove()` e a revogação de sessões → há uma **janela** entre o COMMIT do soft-delete e... nada (não há nada a correr). A barreira é *stateless por pedido*, o que é frágil.
- Não há belt-and-suspenders: se **alguma vez** for introduzida uma cache do utilizador (ex.: cache de `findById` para performance), um utilizador soft-deleted continua a passar durante a TTL da cache.
- O `isRevoked` falha **OPEN** no Redis (VULN-02) — se a barreira de utilizador algum dia depender de Redis, falha.

### 1.4 Cenário de ressurreição (explorável quando há reactivação)

Se um administrador **restaurar** o utilizador (limpar `deletedAt` e repor `isActive = true` — operação plausível, e o `remove()` deixou as sessões intactas propositalmente):

- `findById` volta a retornar o utilizador ativo.
- Um **refresh token pré-existente** (sessão com `revokedAt = null`, ainda dentro dos 7 dias de TTL do JWT) → `POST /auth/refresh` → `UPDATE ... WHERE revokedAt IS NULL` **claima a sessão** → `findById` → ativo → `createTokensAndSession` → **novos tokens emitidos**.

→ O utilizador recupera acesso **com a sessão de antes da remoção**, sem reautenticação. Isto viola o princípio de que *soft-delete = credenciais imediatamente inutilizáveis*.

> **Nota de honestidade:** no código atual **não existe** endpoint de "restore" nem `UsersController` (confirmado: `usersService.remove` e `usersService.findAll` não têm callers em `src/` fora de specs). Por isso, classifico a **ressurreição como latent** — explorável assim que exista qualquer fluxo de reactivação. O defeito central (soft-delete sem revogação de credenciais) é, contudo, **irrefutável** por inspeção.

### 1.5 Isolamento de inquilinos ausente em `users`/`sessions` (RLS)

Complementarmente ao que o utilizador pediu escrutinar:

- `src/database/rls/0001_enable_rls.sql` só ativa RLS em `webhook_endpoints` e `webhook_deliveries`.
- `users.service.ts` — nenhuma query filtra `organization_id`.
- `TenantDatabaseService.withTenant()` **não é usado** por `UsersService`.

→ Qualquer endpoint que venha a expor `usersService.findAll()` / `findById(arbitraryId)` sem scoping permite **leitura cross-tenant**. Hoje latente (sem controller), mas é a mesma classe de defeito: a segurança depende inteiramente de filtros manuais que não existem.

---

## 2. Modelo de Ameaça tático

**Atacante:** utilizador Insider descontente que foi desativado/soft-deleted, OU administrador malicioso que controla a reactivação, OU atacante externo que detinha um refresh token de um utilizador posteriormente desativado e **depois reativado** (ex.: conta de um colaborador que regressa à empresa).

**Limites de confiança comprometidos:**
1. *Credential Lifecycle Boundary* — o soft-delete deveria ser um evento de revogação imediato de todas as credenciais; não é.
2. *Defense-in-Depth* — a segurança repousa numa única lookup DB por pedido, sem redundância (Redis/sessões).
3. (Complementar) *Tenant Isolation Boundary* — sem RLS em `users`/`sessions`.

**Cadeia de exploração (ressurreição):**

1. Utilizador `U` ativo tem sessão `S` (refresh `R`, `revokedAt = null`).
2. Admin executa `usersService.remove(U.id)` → `deletedAt = now`, `isActive = false`. **Sessão `S` intocada.**
3. (passado algum tempo `< 7d`, TTL do refresh JWT)
4. Admin restaura `U`: `UPDATE users SET deleted_at = NULL, is_active = TRUE WHERE id = U`.
5. Antigo `R` (roubado/retenido) → `POST /auth/refresh { refresh_token: R }`:
   - `verify(R)` → RS256 válido (não expirou).
   - `UPDATE sessions SET revokedAt = now() WHERE refresh_token_hash = H(R) AND revokedAt IS NULL` → **claima `S`** (ainda ativa).
   - `findById(U)` → **ativo** (foi restaurado).
   - `createTokensAndSession` → **novos tokens emitidos**.
6. Atacante recupera acesso sem password.

**Variantes de impacto:**
- *Stale session pollution:* as sessões órfãs contam para `MAX_SESSIONS_PER_USER` e aparecem em auditoria como "ativas" de um utilizador "eliminado", poluindo `enforceSessionLimit` e `revokeSessionFamilyAndLogReuse`.
- *Cross-tenant (RLS):* leitura de utilizadores de outra organização via qualquer futuro endpoint sem scoping.

---

## 3. Prova de Conceito

Ficheiro: `poc-vuln-03.py`. Como não existe `UsersController`, o PoC opera ao nível da base de dados (via `psycopg2`) para demonstrar o defeito irrefutável — que as sessões permanecem com `revokedAt = NULL` após o soft-delete — e simula a ressurreição chamando `/auth/refresh` com um refresh token retido.

```bash
# Requer psycopg2-binary e requests
pip install psycopg2-binary requests

export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
export BASE_URL=http://localhost:3000
export VICTIM_EMAIL=victim@example.com
export VICTIM_PASSWORD='SenhaForte123!'
python poc-vuln-03.py
```

Demonstração:
1. Login como `U` → guardar `R`.
2. **Confirmar no DB:** sessão `S` ativa (`revoked_at IS NULL`).
3. Executar o soft-delete diretamente na base de dados (equivalente a `usersService.remove(U)`):
   `UPDATE users SET deleted_at = now(), is_active = false WHERE email = 'U'`.
4. **Confirmar no DB:** `S` continua `revoked_at IS NULL` (**não foi revogada**).
5. (Ressurreição) `UPDATE users SET deleted_at = NULL, is_active = true WHERE email = 'U'`.
6. `POST /auth/refresh { refresh_token: R }` → **200 com novos tokens** → acesso recuperado sem reautenticação.

Trecho SQL equivalente (passo 3 + 4):

```sql
-- Soft-delete (equivale a UsersService.remove)
UPDATE users SET deleted_at = now(), is_active = false WHERE email = 'victim@example.com';

-- Provar que a sessão NAO foi revogada
SELECT id, revoked_at, access_token_jti
FROM sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'victim@example.com')
  AND revoked_at IS NULL;  -- <-- ainda ha linhas: BUG

-- Ressurreicao
UPDATE users SET deleted_at = NULL, is_active = true WHERE email = 'victim@example.com';
-- agora o refresh token retido renova via /auth/refresh
```

---

## 4. Patch de remediação idiomático NestJS

### 4.1 `UsersService.remove()` atómico + revogação total de credenciais

Injetar `TokenRevocationService` (via `SecurityModule` global) e revogar tudo numa **transação**:

```ts
// src/users/users.service.ts
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { sessions } from '@/database/schema/sessions.schema';

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  async remove(id: string): Promise<void> {
    await this.dbService.db.transaction(async (tx) => {
      // 1) Soft-delete do utilizador
      await tx
        .update(users)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(users.id, id));

      // 2) Revogar TODAS as sessoes ativas, recolhendo os JTIs
      const revoked = await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id, accessTokenJti: sessions.accessTokenJti });

      // 3) Adicionar os JTIs a Redis (fora da tx, mas OBRIGATORIO e aguardado)
      const jtis = revoked
        .map((s) => s.accessTokenJti)
        .filter((j): j is string => !!j);

      // Nota: cache-manager nao é transacional; faz-se apos commit implicito.
      // Se falhar, o access token continua valido ate 15m — preferivel fail-closed:
      if (jtis.length > 0) {
        await this.tokenRevocationService.revokeMany(
          jtis,
          TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS,
        );
      }
    });
  }
}
```

> Se a revogação Redis falhar (Redis em baixo), considerar **fail-closed**: lançar e deixar o soft-delete **não cometer** (a transação reverte). Em ambientes `DISABLE_REDIS=true`, isto força o operador a tratar a revogação antes de eliminar utilizadores — preferível a silenciar.

### 4.2 Ativar RLS em `users` e `sessions` + scoping por `organization_id`

```sql
-- src/database/rls/0002_users_sessions_rls.sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (organization_id::text = current_setting('app.current_tenant', true));

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions
  USING (
    organization_id::text = current_setting('app.current_tenant', true)
    OR organization_id IS NULL  -- sessoes de users sem org (ex.: super-admin)
  );
```

> `sessions` precisa de `organization_id` (adicionar coluna denormalizada ou JOIN na policy). Simplificação: adicionar `organization_id` a `sessions` no momento de criação da sessão (`createTokensAndSession`).

### 4.3 `UsersService` deve usar `TenantDatabaseService` e filtrar por `organizationId`

```ts
async findAll(): Promise<Omit<User, 'password'>[]> {
  const orgId = RequestContext.getOrganizationId(); // do request context
  return this.db.select(SAFE_FIELDS).from(users).where(
    and(isNull(users.deletedAt), orgId ? eq(users.organizationId, orgId) : undefined),
  );
}
```

### 4.4 Garantias do patch

- **Revogação atómica:** soft-delete + revogação de sessões + revogação de JTIs numa transação.
- **Sessões órfãs eliminadas:** após `remove()`, `sessions.revokedAt` está sempre preenchido → `refresh()` falha em `UPDATE ... WHERE revokedAt IS NULL`.
- **Ressurreição inócua:** reactivação do utilizador não ressuscita sessões antigas (estão revogadas).
- **Defense-in-depth:** RLS em `users`/`sessions` + filtro `organizationId` na camada de serviço → isolamento de inquilinos belt-and-suspenders.
