# Architecture

## Overview

NestJS Security Pro is a production-ready NestJS backend with a modular structure designed for scalability and maintainability. The system supports **native multi-tenancy** via PostgreSQL Row-Level Security (RLS) and application-level tenant isolation, with Organizations as first-class tenants.

## Module Structure

| Module | Purpose |
|--------|---------|
| AuthModule | Login, refresh, logout, register, change-password |
| UsersModule | User management (creation via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| OrganizationsModule | Organization CRUD |
| TenantModule | Tenant context propagation, `TenantDatabaseService`, `TenantGuard` (`@Global`) |
| AuditModule | Append-only audit logging (`@Global`) |
| HealthModule | Liveness and readiness probes |
| GracefulShutdownModule | Clean shutdown handling |
| LoggerModule | Pino + Correlation ID + PII redaction (`@Global`) |
| SecurityModule | JTI token revocation + credential stuffing detection + Risk Engine (`@Global`) |
| ThrottlerModule | Per-endpoint rate limiting (`@nestjs/throttler`) |
| WebhookEndpointsModule | Webhook endpoint CRUD (no Redis dependency) |
| WebhooksModule | Full webhook pipeline: CRUD + async delivery via BullMQ (requires Redis) |

## Data Flow

```
User → Role → RolePermission → Permission → Feature
User → Organization (tenant)
Organization → WebhookEndpoints → WebhookDeliveries (async via BullMQ)
```

Access control is enforced at the route level via `JwtAuthGuard` and `PermissionGuard` with `@RequirePermissions('feature:action')`.

Tenant scoping is enforced at the route level via `TenantGuard` (checks `organizationId` in `RequestContext`) and at the service level via explicit `WHERE organization_id = ?` on every query.

## Directory Structure

```
src/
├── auth/              # Authentication flows
├── common/            # Guards, decorators
├── config/            # Environment validation (Joi)
├── logger/            # Pino, correlation ID middleware (PII redaction)
├── database/
│   ├── schema/        # Drizzle schema definitions
│   └── rls/           # PostgreSQL RLS SQL (apply once per env)
├── migrations/        # Seed scripts
├── modules/
│   ├── audit/         # Audit log (@Global)
│   ├── health/        # Health checks
│   ├── organizations/ # Organization CRUD
│   └── rbac/          # RBAC entities and services
├── security/          # @Global security module
│   ├── events/             # SecurityEventService (typed audit facade)
│   ├── token-revocation/   # Redis JTI blocklist
│   ├── detection/          # Credential stuffing detection
│   └── risk-engine/        # Login risk scoring (5 signals, 4 levels)
├── tenant/            # @Global tenant module
│   ├── tenant-database.service.ts  # withTenant() — sets app.current_tenant
│   ├── tenant.guard.ts             # TenantGuard
│   └── require-tenant.decorator.ts # @RequireTenant()
├── users/             # UsersService
├── webhooks/          # Webhook pipeline
│   ├── dto/                       # CreateWebhookEndpointDto, UpdateWebhookEndpointDto
│   ├── types/                     # WebhookEventPayload
│   ├── webhook-endpoints.controller.ts
│   ├── webhook-endpoints.service.ts
│   ├── webhook-endpoints.module.ts  # CRUD only (no Redis)
│   ├── webhook.producer.ts          # OnEvent('webhook.**') → BullMQ queue
│   ├── webhook.processor.ts         # Worker: HMAC sign + HTTP delivery
│   └── webhooks.module.ts           # Full pipeline (requires Redis)
└── main.ts
```

## Design Decisions

- **No schema sync in production** — Drizzle migrations only.
- **Fail-fast validation** — Joi schema validates on startup; production enforces required vars.
- **Append-only audit** — No updates or deletes on audit records.
- **Swagger disabled in production** — `NODE_ENV=production` prevents `/api/docs` from being registered. Available only in development and test environments.
- **Two-layer rate limiting** — `express-rate-limit` for broad IP-level protection; `@nestjs/throttler` for fine-grained per-endpoint throttling (especially critical auth routes).
- **Argon2id password hashing** — Replaces bcrypt; transparent migration on first login.
- **Risk Engine** — Scores every login by 5 threat signals (device, IP, failure rate, lockout, reuse). `critical` score (≥80) blocks login and revokes all sessions immediately.
- **currentPassword verification** — `change-password` requires the current password; prevents account takeover via stolen access tokens.
- **Trust proxy enabled** — Ensures real client IPs are used for rate limiting and audit logs when deployed behind Nginx/ALB.
- **Multi-tenancy — belt-and-suspenders isolation** — Every tenant-scoped service method includes an explicit `WHERE organization_id = orgId` clause. `TenantDatabaseService.withTenant()` additionally runs `SET LOCAL app.current_tenant` inside each transaction so that PostgreSQL RLS policies (if applied via `src/database/rls/0001_enable_rls.sql`) enforce isolation at the database engine level as a second layer.
- **Webhook delivery split** — `WebhookEndpointsModule` (CRUD) is always available. `WebhooksModule` (BullMQ delivery queue) is loaded conditionally via `DISABLE_REDIS=true` in `.env` — allows local development without Redis while keeping the full pipeline in production.
- **Dotenv preloaded in `main.ts`** — `import 'dotenv/config'` as the first import ensures `.env` is read before any module-level code evaluates `process.env`, including the `DISABLE_REDIS` conditional in `AppModule`.

## Database Layer (Drizzle)

- Runtime database access uses `DatabaseService` with `drizzle-orm` and `pg` pool.
- Schema definitions live in `src/database/schema`.
- SQL migrations are generated/applied via `drizzle-kit` using `drizzle.config.ts`.
- All user queries filter `deletedAt IS NULL` — soft-deleted users are fully excluded.
- RLS policies are optional DDL, not managed by Drizzle: apply `src/database/rls/0001_enable_rls.sql` once per environment.

## Further Reading

- [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) — Complete RBAC + PostgreSQL RLS multi-tenancy example (Projects CRUD)
- [docs/en/deployment.md](./deployment.md) — Railway, Render, Docker Compose and npm publish guide
