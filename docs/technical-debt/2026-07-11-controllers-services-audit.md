# Auditoria de Dívida Técnica — Camada HTTP e Application Services

**Data:** 2026-07-11  
**Escopo solicitado:** `src/controllers/` e `src/services/`  
**Ferramentas:** inspeção estrutural (tree-ast-grep), grep, leitura de código, subagente explore  
**Branch analisada:** `fix/auth-security-hardening`

---

## 1. Desvio arquitetônico estrutural (grave)

As pastas **`src/controllers/`** e **`src/services/` não existem** no repositório. O projeto adota layout **feature-based** NestJS, dispersando controllers e services por bounded contexts implícitos:

| Camada esperada (DDD) | Localização real |
|----------------------|------------------|
| `src/controllers/` | `src/**/**.controller.ts` (7 ficheiros ativos) |
| `src/services/` | `src/**/**.service.ts` (19 ficheiros ativos) |

**Controllers ativos auditados**

| Ficheiro |
|----------|
| `src/app.controller.ts` |
| `src/auth/auth.controller.ts` |
| `src/modules/health/health.controller.ts` |
| `src/modules/rbac/controllers/feature.controller.ts` |
| `src/modules/rbac/controllers/role.controller.ts` |
| `src/modules/rbac/controllers/permission.controller.ts` |
| `src/webhooks/webhook-endpoints.controller.ts` |

**Nota:** `src/tasks/tasks.controller.ts` e `src/tasks/tasks.service.ts` aparecem como **deletados** no git — dívida de limpeza pendente.

**Proposta imediata (DDD):** Reorganizar por bounded context com camadas explícitas:

```
src/<context>/
  interface/http/          ← controllers
  application/             ← use cases / application services
  domain/                  ← entidades, value objects, domain services
  infrastructure/          ← repositories Drizzle, Redis, mail
```

---

## 2. Metodologia

| Ferramenta | Resultado |
|------------|-----------|
| **tree-ast-grep** (`ast_search`) | Tentativa bloqueada no Windows: path `C:\Program Files\nodejs\ast-grep.cmd` quebra por espaço no nome do diretório. Análise complementada com grep + leitura manual. |
| **grep estrutural** | Padrões DRY, Drizzle, `forwardRef`, dead exports |
| **Leitura de ficheiros** | Todos os controllers e services listados acima |

---

## 3. Resumo executivo

| Categoria | Grave | Moderado | Leve |
|-----------|:-----:|:--------:|:----:|
| Violação DRY | 1 | 6 | 4 |
| Código inativo | 0 | 5 | 6 |
| Acoplamento prejudicial | 1 | 5 | 3 |

**Confirmado ausente:** `forwardRef()` (0 ocorrências), controllers importando Drizzle/schema (0 ocorrências), services importando controllers (0 ocorrências).

---

## 4. Código repetido (violação DRY)

### 4.1 Controllers

| # | Severidade | Problema | Localização | Proposta de refatoração (DDD) |
|---|:----------:|----------|-------------|-------------------------------|
| DRY-01 | Moderado | Extração duplicada de `ip` e `userAgent` do request HTTP | `src/auth/auth.controller.ts` — `login`, `refresh`, `changePassword` | **Interceptor** `ClientContextInterceptor` ou param decorator `@ClientContext()` que popula value object `ClientContext { ip, userAgent }` no `RequestContext` |
| DRY-02 | Moderado | Guard clause redundante `if (!userId) throw new UnauthorizedException(...)` após `@UseGuards(JwtAuthGuard)` | `src/auth/auth.controller.ts:82-84`, `:123-124` | **Param decorator** `@CurrentUser('id') userId: string` tipado; remover checagem manual — o guard já rejeita em `jwt-auth.guard.ts` |
| DRY-03 | Moderado | Template CRUD RBAC copiado 3× (guards, `@RequirePermissions`, blocos Swagger, `ParseUUIDPipe`) | `feature.controller.ts`, `role.controller.ts`, `permission.controller.ts` | **Composite decorators** `@RbacProtected('rbac:view')`, `@RbacCrudResource('features')`; contratos OpenAPI gerados a partir de DTOs de application layer |
| DRY-04 | Leve | Stack de guards repetido com variantes (`Jwt+Permission` vs `Jwt+Tenant`) | RBAC controllers vs `webhook-endpoints.controller.ts:23-24` | `@TenantScoped()` e `@RbacScoped()` como decorators compostos |
| DRY-05 | Leve | Imports inconsistentes (`./auth/...` vs `@/auth/...`) | `src/app.controller.ts:4` vs demais controllers | Padronizar alias `@/` na camada interface |
| DRY-06 | Leve | Contrato HTTP inconsistente: `role.update()` não devolve `rolePermissions`; `findOne`/`findAll` devolvem | `role.controller.ts:96-97` + `role.service.ts:109-110` | Application layer retorna sempre `RoleReadModel` via **mapper** dedicado; controller nunca expõe shape ORM |
| DRY-07 | **Grave** | **Auditoria duplicada** na mesma operação HTTP | `role.controller.ts:120` (`@Auditable('role.assign_permissions')`) **e** `role.service.ts:170-176` (`auditLogService.log('rbac.role.permissions_assigned')`) | **Uma única fronteira de audit** por use case: ou `@Auditable` + interceptor enriquecido, **ou** audit explícito no application service — nunca ambos. Preferível: `AssignPermissionsHandler` + domain event `RolePermissionsChanged` → `AuditLogProjector` |

### 4.2 Services (transversal — relevante para pipes/interceptors)

| # | Severidade | Problema | Localização | Proposta de refatoração (DDD) |
|---|:----------:|----------|-------------|-------------------------------|
| DRY-S01 | Moderado | Catch duplicado de erros PostgreSQL `23505`/`23503` com `ConflictException`/`NotFoundException` | `feature.service.ts:27-31`, `:97-103`; `permission.service.ts:27-31`, `:67-73` | **`PostgresErrorMapper`** ou wrapper `repository.insertOrThrowConflict()` na infraestrutura |
| DRY-S02 | Leve | try/catch/log/rethrow duplicado em envio de email | `mail.service.ts:22-34`, `:40-57` | Método privado `sendTemplate(templateId, payload)` |
| DRY-S03 | Leve | Getter `private get db()` repetido em múltiplos services | RBAC services, `users.service.ts`, `webhook-endpoints.service.ts` | Classe base **`DrizzleRepository<T>`** ou composição via `DatabaseService` |
| DRY-S04 | Moderado | Lógica duplicada de revogação JTI (`flatMap access+refresh` + `revokeMany`) | `auth.service.ts` (`revokeSessionCredentials`) e `users.service.ts:172-179` | **`SessionRevocationService`** na application layer (DB + Redis) consumido por Auth e Users |

### 4.3 O que **não** foi encontrado em controllers

| Anti-padrão | Evidência |
|-------------|-----------|
| try/catch duplicado transversal | Único try/catch: `health.controller.ts:38` (apropriado para Terminus) |
| Formatação manual de erros HTTP repetida | Exceções Nest (`UnauthorizedException`, etc.) delegadas ao filter global |
| Validação manual extensiva | DTOs + `ValidationPipe` global; exceção pontual DRY-02 |

**Recomendação global:** Manter `ValidationPipe` global; introduzir **`@CurrentUser()`**, **`@ClientContext()`** e **composite guards** em vez de expandir lógica nos controllers.

---

## 5. Código inativo (dead code)

| # | Severidade | Problema | Localização | Proposta de refatoração (DDD) |
|---|:----------:|----------|-------------|-------------------------------|
| DC-01 | Moderado | `LoggerService` exportado, nunca registado nem importado | `src/logger/logger.service.ts:1-4` | Remover ou integrar como adapter Pino na infraestrutura |
| DC-02 | Moderado | `MailModule` / `MailService` órfãos — não importados em `app.module.ts` | `src/common/mail/mail.module.ts`, `mail.service.ts` | Integrar via domain event (`UserRegistered` → handler) ou remover até existir bounded context Notifications |
| DC-03 | Moderado | `BaseAuditService` abstract sem subclasses (`extends BaseAuditService` → 0) | `src/modules/audit/base-audit.service.ts:13-18` | Fazer services estenderem, ou remover e usar domain events + `AuditLogProjector` |
| DC-04 | Moderado | `SecurityEventService.loginFailed()` e `.sessionRevoked()` nunca chamados em produção | `src/security/events/security-event.service.ts:19-52` | Wire-up nos fluxos auth ou remover; usar `AuditLogService`/domain events |
| DC-05 | Moderado | `UsersService.findAll()` e `.remove()` sem consumidor fora de testes; **sem `UsersController`** | `src/users/users.service.ts:47-58`, `:147-184` | Expor via `UsersController` + use cases, ou remover até bounded context Users existir |
| DC-06 | Leve | Imports mortos: `count`, `users` (schema); método `constantTimeCompare()` nunca chamado | `src/auth/auth.service.ts:10`, `:20`, `:88-98` | Remover; se timing-safe compare for necessário → `CryptoDomainService` |
| DC-07 | Leve | Enum `SecurityEventType` — valores definidos mas não usados nos métodos | `src/security/events/security-event.service.ts:4-13` | Centralizar actions no domain de security events |
| DC-08 | Leve | Parâmetro `currentUserId?` em `assignPermissions()` nunca passado pelo controller | `role.service.ts:134`; `role.controller.ts:131` | `@CurrentUser()` no controller → passar `actorUserId` ao use case |
| DC-09 | Leve | Parâmetro `triggerEmail` de `blockIp()` declarado mas não usado | `suspicious-activity.service.ts:89` | Remover ou prefixar `_triggerEmail` |
| DC-10 | Leve | Endpoint demo `getPremiumEcho()` — `@Body()` em `@Get()` (body ignorado por clientes HTTP) | `src/app.controller.ts:15-20` | Remover ou converter para `@Post()` |

---

## 6. Acoplamento prejudicial

### 6.1 forwardRef e Drizzle em controllers

| Verificação | Resultado |
|-------------|-----------|
| `forwardRef()` | **0 ocorrências** — não há remediação circular via forwardRef |
| Controllers importando `drizzle-orm` ou `@/database/schema` | **0 ocorrências** — camada HTTP respeita isolamento ORM |
| Services importando controllers | **0 ocorrências** |

### 6.2 Acoplamentos confirmados

| # | Severidade | Problema | Localização | Proposta de refatoração (DDD) |
|---|:----------:|----------|-------------|-------------------------------|
| CP-01 | **Grave** | **God service** — auth concentra domínio + infra (531 linhas, 8 dependências, queries Drizzle inline em `sessions`) | `src/auth/auth.service.ts` | Decompor em **use cases** (`Login`, `RefreshToken`, `Logout`, `ChangePassword`) + `SessionRepository` + `SessionDomainService` + domain events |
| CP-02 | Moderado | Persistência Drizzle + schema leak na application layer (não nos controllers) | `auth.service.ts`, `users.service.ts`, RBAC services (`feature`, `permission`, `role`, `rbac`), `webhook-endpoints.service.ts`, `audit-log.service.ts`, `risk-engine.service.ts` | **Repositories por aggregate** na infra; application depende de interfaces (`ISessionRepository`, `IRoleRepository`) |
| CP-03 | Moderado | Controller injeta `DatabaseService` e contém lógica de health check | `src/modules/health/health.controller.ts:10`, `:35-48` | `DatabaseHealthIndicator` dedicado; controller só orquestra indicators (como `RedisHealthIndicator`) |
| CP-04 | Moderado | Guard em `common/` importa `RbacService` diretamente | `src/common/guards/permission.guard.ts:12` | Interface **`PermissionChecker`** no shared kernel; `RbacPermissionChecker` na infra RBAC |
| CP-05 | Moderado | `CacheModule.register()` duplicado com configs diferentes | `security.module.ts:17`, `rbac.module.ts:14-17` | Um único `CacheModule.registerAsync` global em `AppModule` / `InfrastructureModule` |
| CP-06 | Leve | Imports path alias inconsistentes (`src/users` vs `@/users`) | `auth.service.ts:14`, `jwt.strategy.ts:5`, `auth.module.ts:5` | Padronizar `@/users/...` |
| CP-07 | Leve | `WebhookEndpointsService` lança `Error` genérico se tenant context ausente | `webhook-endpoints.service.ts:14-17` | `TenantContext` request-scoped; falha como domain exception mapeada pelo filter |

### 6.3 Mapa de acoplamento Drizzle (services — violação camada)

| Service | Importa `drizzle-orm` | Importa `@/database/schema` |
|---------|:---------------------:|:-----------------------------:|
| `auth.service.ts` | ✓ | ✓ (`sessions`, `users`) |
| `users.service.ts` | ✓ | ✓ (`users`, `sessions`) |
| `feature.service.ts` | ✓ | ✓ |
| `permission.service.ts` | ✓ | ✓ |
| `role.service.ts` | ✓ | ✓ |
| `rbac.service.ts` | ✓ | ✓ |
| `webhook-endpoints.service.ts` | ✓ | ✓ |
| `audit-log.service.ts` | ✓ | ✓ |
| `risk-engine.service.ts` | ✓ | ✓ |
| `tenant-database.service.ts` | ✓ | ✓ |
| **Todos os controllers** | ✗ | ✗ |

Isto confirma: **controllers respeitam isolamento ORM**; a violação está na **application layer** (services atuando como repositories + domain + infra).

---

## 7. Priorização de refatoração

| Prioridade | ID | Ação |
|:----------:|:---:|------|
| P0 | DRY-07 | Eliminar audit duplicado em `assignPermissions` |
| P0 | CP-01 | Decompor `AuthService` em use cases + repositories |
| P1 | DRY-01, DRY-02 | `@ClientContext()` + `@CurrentUser()` no auth controller |
| P1 | DRY-03 | Composite decorators RBAC |
| P1 | DC-01–DC-05 | Remover ou integrar código morto (Mail, Logger, BaseAudit, SecurityEvent, Users sem controller) |
| P1 | CP-05 | Unificar `CacheModule` |
| P2 | DRY-S01, DRY-S04 | `PostgresErrorMapper`, `SessionRevocationService` |
| P2 | DC-06 | Limpar imports/métodos mortos em `auth.service.ts` |
| P3 | Estrutural | Migrar de layout feature-based para `interface/application/domain/infrastructure` por bounded context |

---

## 8. Conclusão

A dívida técnica **confirmada** concentra-se em:

1. **Ausência das pastas canónicas** `src/controllers/` e `src/services/` — dispersão por features sem fronteiras DDD explícitas.
2. **DRY grave** na auditoria duplicada (`assignPermissions`) e **god service** em `AuthService`.
3. **Dead code moderado** — módulos órfãos (`Mail`, `Logger`), abstrações não usadas (`BaseAuditService`), API Users sem controller.
4. **Acoplamento ORM na application layer** (services), não nos controllers — exige repositories na infraestrutura.
5. **Ausência de `forwardRef`** — não há remediação circular precária; o acoplamento é estrutural (services monolíticos + Drizzle inline).

Os controllers estão relativamente finos (delegação one-liner), mas repetem **padrões declarativos** (guards, Swagger, contexto HTTP) que devem migrar para **interceptors, pipes e composite decorators** conforme design DDD na camada interface.
