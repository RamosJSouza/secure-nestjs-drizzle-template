# Arquitetura

## Visão Geral

O NestJS Security Pro é um backend NestJS pronto para produção, com estrutura modular voltada a escalabilidade e manutenção. O sistema suporta **multi-tenancy nativo** via PostgreSQL Row-Level Security (RLS) e isolamento de tenant no nível da aplicação, com Organizations como tenants de primeira classe.

## Módulos

### Infraestrutura (global ou transversal)

| Módulo | Escopo | Finalidade |
|--------|--------|------------|
| ConfigModule | Global | Carregamento de ambiente + validação Joi (`src/config/validation.schema.ts`) |
| DatabaseModule | `@Global` | Pool PostgreSQL + Drizzle (`DatabaseService.db`) |
| LoggerModule | `@Global` | Logging estruturado Pino + middleware de correlation ID |
| SecurityModule | `@Global` | Revogação JTI, credential stuffing, Motor de Risco, `SecurityEventService`; importa `AppCacheModule` |
| AppCacheModule | `@Global` (via SecurityModule) | Cache Redis ou in-memory para permissões RBAC e blocklist JTI |
| TenantModule | `@Global` | `TenantDatabaseService.withTenant()`, `TenantGuard`, `@RequireTenant()` |
| RbacModule | `@Global` | CRUD RBAC + `RbacService` (verificação de permissões com cache) |
| AuditModule | `@Global` | Log de auditoria append-only + `AuditInterceptor` global |
| ThrottlerModule | App-wide | Rate limiting por endpoint (`ThrottlerGuard` registrado globalmente) |
| ScheduleModule | App-wide | Tarefas agendadas (`@nestjs/schedule`) |
| EventEmitterModule | App-wide | Eventos in-process (`@nestjs/event-emitter`, wildcard habilitado) |
| BullModule | Condicional | Conexão root BullMQ — carregado apenas quando `DISABLE_REDIS !== 'true'` |

### Módulos de domínio

| Módulo | Finalidade |
|--------|------------|
| AuthModule | Login, refresh, logout, registro, forgot/reset senha, verificação de e-mail |
| MailModule | E-mail transacional via `IEmailProvider` (Nodemailer: Ethereal dev / SMTP prod) |
| AuthGuardsModule | `EmailVerificationGuard`, `GracePeriodGuard` (evita deps circulares com UsersModule) |
| UsersModule | Gestão de usuários, lockout, soft-delete, revogação de sessões, rota demo sensitive-action |
| OrganizationsModule | **Placeholder** — entidade existe no schema Drizzle; CRUD ainda não implementado |
| HealthModule | Probes de liveness e readiness |
| GracefulShutdownModule | Encerramento controlado |
| WebhookEndpointsModule | CRUD de webhook endpoints (sempre carregado quando Redis está desabilitado) |
| WebhooksModule | Pipeline completo: CRUD + entrega assíncrona via BullMQ (requer Redis) |

> **Ordem de importação no `AppModule`:** `SecurityModule` e `TenantModule` devem ser importados antes de `AuthModule` para que os providers globais (cache, revogação, contexto de tenant) estejam disponíveis durante o bootstrap de autenticação.

## Fluxo de Dados

```
User → Role → RolePermission → Permission → Feature
User → Organization (tenant)
Organization → WebhookEndpoints → WebhookDeliveries (assíncrono via BullMQ)
```

O controle de acesso é aplicado nas rotas via `JwtAuthGuard` e `PermissionGuard` com `@RequirePermissions('feature:action')`.

O isolamento de tenant é aplicado nas rotas via `TenantGuard` (verifica `organizationId` no `RequestContext`) e no nível de serviço via `WHERE organization_id = ?` explícito em cada query.

## Estrutura de Diretórios

```
src/
├── auth/              # Autenticação, recovery, verificação, opaque token store
│   ├── guards/        # EmailVerificationGuard, GracePeriodGuard
│   ├── ports/         # OpaqueTokenStorePort
│   └── services/      # PasswordRecoveryService, EmailVerificationService
├── common/
│   ├── guards/        # JwtAuthGuard, PermissionGuard
│   ├── mail/          # MailModule, MailFacade, NodemailerAdapter
├── config/            # Validação de ambiente (Joi)
├── logger/            # Pino, middleware de correlation ID (redaction de PII)
├── database/
│   ├── schema/        # Definições de schema Drizzle
│   └── rls/           # SQL de RLS do PostgreSQL (aplicar uma vez por ambiente)
├── migrations/        # Scripts de seed
├── modules/
│   ├── audit/         # Log de auditoria (@Global)
│   ├── health/        # Health checks
│   ├── organizations/ # CRUD de organizações
│   └── rbac/          # Entidades e serviços RBAC
├── security/          # Módulo de segurança @Global
│   ├── cache/              # AppCacheModule (Redis ou CACHE_MANAGER in-memory)
│   ├── events/             # SecurityEventService (facade tipada de auditoria)
│   ├── token-revocation/   # Blocklist Redis de JTI
│   ├── detection/          # Detecção de credential stuffing
│   └── risk-engine/        # Pontuação de risco no login (5 sinais, 4 níveis)
├── tenant/            # Módulo de tenant @Global
│   ├── tenant-database.service.ts  # withTenant() — define app.current_tenant
│   ├── tenant.guard.ts             # TenantGuard
│   └── require-tenant.decorator.ts # @RequireTenant()
├── users/             # UsersService
├── webhooks/          # Pipeline de webhooks
│   ├── dto/                       # CreateWebhookEndpointDto, UpdateWebhookEndpointDto
│   ├── types/                     # WebhookEventPayload
│   ├── webhook-endpoints.controller.ts
│   ├── webhook-endpoints.service.ts
│   ├── webhook-endpoints.module.ts  # Apenas CRUD (sem Redis)
│   ├── webhook.producer.ts          # OnEvent('webhook.**') → fila BullMQ
│   ├── webhook.processor.ts         # Worker: assinatura HMAC + entrega HTTP
│   └── webhooks.module.ts           # Pipeline completo (requer Redis)
└── main.ts
```

## Decisões de Design

- **Sem schema sync em produção** — Apenas migrations do Drizzle.
- **Validação fail-fast** — Schema Joi valida na inicialização; produção exige variáveis obrigatórias.
- **Auditoria append-only** — Sem updates ou deletes em registros de auditoria.
- **Swagger desabilitado em produção** — `NODE_ENV=production` impede o registro de `/api/docs`. Disponível apenas em desenvolvimento e teste.
- **Rate limiting em duas camadas** — `express-rate-limit` para proteção ampla por IP; `@nestjs/throttler` para throttling fino por endpoint (especialmente rotas críticas de autenticação).
- **Hash de senhas com Argon2id** — Substitui o bcrypt; migração transparente no primeiro login.
- **Motor de Risco** — Pontua cada login por 5 sinais de ameaça (dispositivo, IP, taxa de falhas, bloqueio, reutilização). Pontuação `critical` (≥80) bloqueia o login e revoga todas as sessões imediatamente.
- **Verificação de senha atual** — `change-password` exige a senha atual; previne tomada de conta via token de acesso roubado.
- **Trust proxy habilitado** — Garante que os IPs reais dos clientes sejam usados no rate limiting e nos logs de auditoria quando implantado atrás de Nginx/ALB.
- **Isolamento multi-tenant — dupla camada** — Todo método de serviço com escopo de tenant inclui uma cláusula `WHERE organization_id = orgId` explícita. `TenantDatabaseService.withTenant()` adicionalmente executa `SET LOCAL app.current_tenant` dentro de cada transação, permitindo que as políticas de RLS do PostgreSQL (se aplicadas via `src/database/rls/0001_enable_rls.sql`) reforcem o isolamento no nível do motor de banco como segunda camada.
- **Pipeline de webhooks separado** — `WebhookEndpointsModule` (CRUD) está sempre disponível. `WebhooksModule` (fila de entrega BullMQ) é carregado condicionalmente via `DISABLE_REDIS=true` no `.env` — permite desenvolvimento local sem Redis enquanto mantém o pipeline completo em produção.
- **Camada de cache unificada** — `AppCacheModule` (`src/security/cache/`) fornece um único `CACHE_MANAGER` para cache de permissões RBAC e blocklist JTI. Usa Redis quando disponível; fallback in-memory quando `DISABLE_REDIS=true`.
- **Dotenv pré-carregado em `main.ts`** — `import 'dotenv/config'` como primeiro import garante que o `.env` seja lido antes que qualquer código em nível de módulo avalie `process.env`, incluindo o condicional `DISABLE_REDIS` no `AppModule`.

## Camada de Banco (Drizzle)

- O acesso ao banco em runtime usa `DatabaseService` com `drizzle-orm` e pool `pg`.
- Os schemas ficam em `src/database/schema`.
- As migrations SQL são geradas/aplicadas com `drizzle-kit` via `drizzle.config.ts`.
- Todas as queries de usuário filtram `deletedAt IS NULL` — usuários com soft-delete são completamente excluídos.
- As políticas RLS são DDL opcional, não gerenciadas pelo Drizzle: aplique `src/database/rls/0001_enable_rls.sql` uma vez por ambiente.

### Tabelas do schema (`src/database/schema/`)

| Tabela | Finalidade |
|--------|------------|
| `users` | Contas, role, organização, lockout, soft-delete, `emailVerifiedAt`, `passwordChangedAt` |
| `roles` | Papéis RBAC |
| `features` | Módulos/features do RBAC |
| `permissions` | Ações por feature |
| `role_permissions` | Grants role ↔ permissão |
| `sessions` | Refresh tokens, JTIs, fingerprint, rotação |
| `organizations` | Orgs multi-tenant (usadas por users/sessions/webhooks) |
| `audit_logs` | Trilha de auditoria append-only |
| `webhook_endpoints` | URLs de webhook por org + segredos HMAC |
| `webhook_deliveries` | Tentativas e status de entrega |

### Migrations (`drizzle/`)

| Arquivo | Resumo |
|---------|--------|
| `0000_organic_silhouette.sql` | Schema base |
| `0001_good_jack_murdock.sql` | JTI do access token, device fingerprint, índices de sessão |
| `0002_romantic_eternals.sql` | Webhooks + `organization_id` em users |
| `0003_open_madripoor.sql` | `refresh_token_jti`, `organization_id` em sessions |
| `0004_robust_multiple_man.sql` | `emailVerifiedAt`, `passwordChangedAt` em users |

Execute `npm run seed:rbac` após as migrations para criar features, permissões, roles (Super Admin, Manager, Viewer) e um usuário admin padrão. **Altere as credenciais do seed antes de qualquer deploy em produção.**

## API HTTP (atual)

| Prefixo | Auth | Descrição |
|---------|------|-----------|
| `GET /` | Não | Raiz / boas-vindas |
| `POST /auth/login` | Não | Login (throttle 5/min) |
| `POST /auth/refresh` | Não | Rotação de refresh token (10/min) |
| `POST /auth/logout` | Bearer | Revoga sessão + JTI |
| `POST /auth/register` | Bearer + `users:create` | Criação de usuário (admin) |
| `POST /auth/change-password` | Bearer | Altera senha + revoga todas as sessões |
| `POST /auth/forgot-password` | Não | Solicitar e-mail de reset (sempre 202) |
| `POST /auth/reset-password` | Não | Redefinir senha com token opaco |
| `POST /auth/send-verification` | Bearer | Reenviar verificação de e-mail (throttled) |
| `POST /auth/verify-email` | Não | Confirmar e-mail com token opaco |
| `POST /users/sensitive-action` | Bearer + e-mail verificado + grace period | Rota demo protegida |
| `GET/POST/PUT/DELETE /features` | Bearer + RBAC | CRUD de features |
| `GET/POST/PUT/DELETE /roles` | Bearer + RBAC | CRUD de roles |
| `POST /roles/:id/permissions` | Bearer + `rbac:assign_permissions` | Atribuir permissões |
| `GET/POST/PUT/DELETE /permissions` | Bearer + RBAC | CRUD de permissões |
| `GET/POST/PATCH/DELETE /webhook-endpoints` | Bearer + tenant | CRUD de webhooks (exige `@RequireTenant()`) |
| `GET /health/liveness` | Não | Processo vivo |
| `GET /health/readiness` | Não | Saúde DB + Redis |
| `GET /api/docs` | Não | Swagger UI (apenas dev/test) |

## Testes

| Camada | Local | Notas |
|--------|-------|-------|
| Unitários | `src/**/*.spec.ts` | Jest, `rootDir: src` — **97 testes / 21 suites** |
| E2E | `test/*.e2e-spec.ts` | Requer PostgreSQL; inclui cenários de isolamento multi-tenant |

O CI exige **≥ 85% de cobertura** (statements, branches, functions, lines) via `.github/workflows/ci.yml`.

## Leitura Complementar

- [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) — Exemplo completo RBAC + PostgreSQL RLS com multi-tenancy (CRUD de Projects)
- [docs/pt-br/deployment.md](../pt-br/deployment.md) — Guia de deploy Railway, Render, Docker Compose e publicação npm
