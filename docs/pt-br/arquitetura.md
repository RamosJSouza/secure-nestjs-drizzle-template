# Arquitetura

## Visão Geral

O NestJS Security Pro é um backend NestJS pronto para produção, com estrutura modular voltada a escalabilidade e manutenção. O sistema suporta **multi-tenancy nativo** via PostgreSQL Row-Level Security (RLS) e isolamento de tenant no nível da aplicação, com Organizations como tenants de primeira classe.

## Módulos

| Módulo | Finalidade |
|--------|------------|
| AuthModule | Login, refresh, logout, registro, alteração de senha |
| UsersModule | Gestão de usuários (criação via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| OrganizationsModule | CRUD de organizações |
| TenantModule | Propagação de contexto de tenant, `TenantDatabaseService`, `TenantGuard` (`@Global`) |
| AuditModule | Log de auditoria append-only (`@Global`) |
| HealthModule | Probes de liveness e readiness |
| GracefulShutdownModule | Encerramento controlado |
| LoggerModule | Pino, Correlation ID e redaction de PII (`@Global`) |
| SecurityModule | Revogação de JTI, detecção de credential stuffing e Motor de Risco (`@Global`) |
| ThrottlerModule | Rate limiting por endpoint (`@nestjs/throttler`) |
| WebhookEndpointsModule | CRUD de webhook endpoints (sem dependência de Redis) |
| WebhooksModule | Pipeline completo de webhooks: CRUD + entrega assíncrona via BullMQ (requer Redis) |

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
├── auth/              # Fluxos de autenticação
├── common/            # Guards, decorators
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
- **Dotenv pré-carregado em `main.ts`** — `import 'dotenv/config'` como primeiro import garante que o `.env` seja lido antes que qualquer código em nível de módulo avalie `process.env`, incluindo o condicional `DISABLE_REDIS` no `AppModule`.

## Camada de Banco (Drizzle)

- O acesso ao banco em runtime usa `DatabaseService` com `drizzle-orm` e pool `pg`.
- Os schemas ficam em `src/database/schema`.
- As migrations SQL são geradas/aplicadas com `drizzle-kit` via `drizzle.config.ts`.
- Todas as queries de usuário filtram `deletedAt IS NULL` — usuários com soft-delete são completamente excluídos.
- As políticas RLS são DDL opcional, não gerenciadas pelo Drizzle: aplique `src/database/rls/0001_enable_rls.sql` uma vez por ambiente.

## Leitura Complementar

- [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) — Exemplo completo RBAC + PostgreSQL RLS com multi-tenancy (CRUD de Projects)
- [docs/en/deployment.md](../en/deployment.md) — Guia de deploy Railway, Render, Docker Compose e publicação npm
