# Auditoria de Segurança — `src/auth` & `src/users`

**Data:** 2026-07-11
**Âmbito:** `src/auth/**`, `src/users/**`, e serviços de suporte (`token-revocation`, `database`, `tenant`, `rbac`).
**Stack:** NestJS + Drizzle (node-postgres) + JWT RS256 + RBAC em base de dados + Redis (cache-manager).

> Método: análise estrutural (`tree-ast-grep`/`ast-grep`) + leitura minuciosa dos ficheiros.
> O servidor MCP `filesystem` estava indisponível (erro de live discovery); a leitura foi feita via ferramentas nativas. O `ast-grep` teve falhas de quoting de path no Windows (`'C:\Program' não é reconhecido`), pelo que a confirmação estrutural foi complementada por inspeção direta do código.

---

## Vulnerabilidades confirmadas

| ID | Título | Severidade | Explorável agora? | Ficheiro |
|----|--------|-----------|-------------------|----------|
| **VULN-01** | Confusão de tokens JWT: refresh token aceite como access token (falta de `typ`/`aud`/`jti`) | **CRÍTICA** | **Sim** | `auth.service.ts`, `jwt.strategy.ts` |
| **VULN-02** | Race condition na revogação do JTI no Redis durante o `refresh` (fire-and-forget + erro silenciado) | **ALTA** | **Sim** | `auth.service.ts:347-351` |
| **VULN-03** | `UsersService.remove()` (soft-delete) não revoga sessões nem JTIs — falha de defense-in-depth + ressurreição de sessões pré-existentes | **MÉDIA-ALTA** | Latente (ver nota) | `users.service.ts:135-140` |

Cada vulnerabilidade está detalhada em `VULN-0X-*.md` com **Modelo de Ameaça tático**, **Prova de Conceito** (`poc-vuln-0X.py`) e **Patch de remediação idiomático NestJS**.

---

## Escrutínio adicional solicitado

### Assimetria das chaves criptográficas (RS256) — **CORRETA, sem vulnerabilidade**

Verificado ponto-a-ponto:

- `auth.module.ts:17-25` — `JwtModule` assina com `keys.privateKey` e expõe `keys.publicKey`, `signOptions: { algorithm: 'RS256' }`.
- `jwt.strategy.ts:16-21` — `secretOrKey: configService.get('keys.publicKey')`, `algorithms: ['RS256']`, `ignoreExpiration: false`.
- `auth.service.ts:317` — `verify(token, { algorithms: ['RS256'] })` (refresh).
- `auth.service.ts:404-412` — `sign(..., { algorithm: 'RS256' })` (access e refresh).

A assimetria está **bem aplicada**: chave privada só assina, chave pública só verifica, algoritmo restrito a `RS256` em todos os caminhos. **Não há downgrade para `none`/HS256** porque `algorithms` está sempre explicitamente definido.

**Contudo**, o problema não está na assimetria — está na **semântica dos tokens** (ver VULN-01): ambos os tokens são assinados pelo mesmo par de chaves sem qualquer claim discriminante (`typ`, `aud`, `iss`, `jti` no refresh), permitindo confusão de tipo.

### Isolamento de inquilinos (RLS) — **DEFICIENTE**

- `src/database/rls/0001_enable_rls.sql` ativa RLS **apenas** em `webhook_endpoints` e `webhook_deliveries`. **Não ativa RLS em `users` nem em `sessions`.**
- `src/users/users.service.ts` — nenhuma query (`findAll`, `findOne`, `findById`, `findOneByIdForAuth`) inclui `WHERE organization_id = ?`. O campo `organizationId` existe no schema (`users.schema.ts:13`) mas é ignorado nas leituras.
- `src/tenant/tenant.guard.ts` apenas verifica a **presença** de `organizationId` no `RequestContext`; **não filtra queries**.
- `src/tenant/tenant-database.service.ts` define `app.current_tenant` apenas dentro de `withTenant()` — mas `UsersService` **não utiliza** `TenantDatabaseService`; usa o `db` global sem `set_config`.

**Impacto:** a aplicação depende exclusivamente de filtros `WHERE organization_id = ?` ao nível do serviço, e `UsersService` **não os aplica**. Qualquer endpoint futuro (ou qualquer controller que reexponha `usersService.findAll()`/`findById()`) permite leitura cross-tenant de utilizadores. Hoje não existe `UsersController` (confirmado: `usersService.findAll` não tem callers em `src/` fora de specs), pelo que é uma **deficiência latente de isolamento**, não uma exploração ativa. Recomenda-se remediação preventiva (patch em VULN-03).

### Falha OPEN do Redis (`token-revocation.service.ts:72-83`)

`isRevoked()` retorna `false` em caso de erro Redis (fail-open). Combinado com `.env.example:40` (`DISABLE_REDIS=true` por defeito local), o frontier de revogação de JTIs é **best-effort**. Isto amplifica VULN-01 e VULN-02 (ver respetivos modelos de ameaça).

---

## Como reproduzir

```bash
cd security-audit
# Ajustar BASE_URL, USER_EMAIL, USER_PASSWORD em cada script.
python poc-vuln-01.py   # Confusão refresh-as-access (sobrevive a logout + change-password)
python poc-vuln-02.py   # Race de revogação de JTI (janela de aceitação do token antigo)
python poc-vuln-03.py   # Soft-delete sem revogação + ressurreição de sessão
```
