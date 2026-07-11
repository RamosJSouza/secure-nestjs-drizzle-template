# Architecture

## Overview

NestJS Security Pro is a production-ready NestJS backend with a modular structure designed for scalability and maintainability. The system supports **native multi-tenancy** via PostgreSQL Row-Level Security (RLS) and application-level tenant isolation, with Organizations as first-class tenants.

## Module Structure

### Infrastructure (global or cross-cutting)

| Module | Scope | Purpose |
|--------|-------|---------|
| ConfigModule | Global | Environment loading + Joi validation (`src/config/validation.schema.ts`) |
| DatabaseModule | `@Global` | PostgreSQL pool + Drizzle (`DatabaseService.db`) |
| LoggerModule | `@Global` | Pino structured logging + correlation ID middleware |
| SecurityModule | `@Global` | JTI revocation, credential stuffing, Risk Engine, `SecurityEventService`; imports `AppCacheModule` |
| AppCacheModule | `@Global` (via SecurityModule) | Redis or in-memory cache for RBAC permissions and JTI blocklist |
| TenantModule | `@Global` | `TenantDatabaseService.withTenant()`, `TenantGuard`, `@RequireTenant()` |
| RbacModule | `@Global` | RBAC CRUD + `RbacService` (permission checks with cache) |
| AuditModule | `@Global` | Append-only audit log + global `AuditInterceptor` |
| ThrottlerModule | App-wide | Per-endpoint rate limiting (`ThrottlerGuard` registered globally) |
| ScheduleModule | App-wide | Cron/scheduled tasks (`@nestjs/schedule`) |
| EventEmitterModule | App-wide | In-process events (`@nestjs/event-emitter`, wildcard enabled) |
| BullModule | Conditional | BullMQ root connection — loaded only when `DISABLE_REDIS !== 'true'` |

### Feature modules

| Module | Purpose |
|--------|---------|
| AuthModule | Login, refresh, logout, register, change-password |
| UsersModule | Internal user management (lockout, soft-delete, session revocation) |
| OrganizationsModule | **Placeholder** — entity exists in Drizzle schema; CRUD not implemented yet |
| HealthModule | Liveness and readiness probes |
| GracefulShutdownModule | Clean shutdown handling |
| WebhookEndpointsModule | Webhook endpoint CRUD (always loaded when Redis is disabled) |
| WebhooksModule | Full webhook pipeline: CRUD + async delivery via BullMQ (requires Redis) |

> **Import order in `AppModule`:** `SecurityModule` and `TenantModule` must be imported before `AuthModule` so global providers (cache, revocation, tenant context) are available during auth bootstrap.

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
│   ├── cache/              # AppCacheModule (Redis or in-memory CACHE_MANAGER)
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
- **Unified cache layer** — `AppCacheModule` (`src/security/cache/`) provides a single `CACHE_MANAGER` for RBAC permission cache and JTI blocklist. Uses Redis when available; falls back to in-memory when `DISABLE_REDIS=true`.
- **Dotenv preloaded in `main.ts`** — `import 'dotenv/config'` as the first import ensures `.env` is read before any module-level code evaluates `process.env`, including the `DISABLE_REDIS` conditional in `AppModule`.

## Database Layer (Drizzle)

- Runtime database access uses `DatabaseService` with `drizzle-orm` and `pg` pool.
- Schema definitions live in `src/database/schema`.
- SQL migrations are generated/applied via `drizzle-kit` using `drizzle.config.ts`.
- All user queries filter `deletedAt IS NULL` — soft-deleted users are fully excluded.
- RLS policies are optional DDL, not managed by Drizzle: apply `src/database/rls/0001_enable_rls.sql` once per environment.

### Schema tables (`src/database/schema/`)

| Table | Purpose |
|-------|---------|
| `users` | Accounts, role linkage, organization, lockout, soft-delete |
| `roles` | RBAC roles |
| `features` | RBAC feature modules |
| `permissions` | Actions per feature |
| `role_permissions` | Role ↔ permission grants |
| `sessions` | Refresh tokens, JTIs, device fingerprint, rotation |
| `organizations` | Multi-tenant orgs (used by users/sessions/webhooks) |
| `audit_logs` | Append-only audit trail |
| `webhook_endpoints` | Per-org webhook URLs + HMAC secrets |
| `webhook_deliveries` | Delivery attempts and status |

### Migrations (`drizzle/`)

| File | Summary |
|------|---------|
| `0000_organic_silhouette.sql` | Base schema |
| `0001_good_jack_murdock.sql` | Access token JTI, device fingerprint, session indexes |
| `0002_romantic_eternals.sql` | Webhooks + `organization_id` on users |
| `0003_open_madripoor.sql` | `refresh_token_jti`, `organization_id` on sessions |

Run `npm run seed:rbac` after migrations to create features, permissions, roles (Super Admin, Manager, Viewer), and a default admin user. **Change seed credentials before any production deploy.**

## HTTP API (current)

| Prefix | Auth | Description |
|--------|------|-------------|
| `GET /` | No | Root / welcome |
| `POST /auth/login` | No | Login (throttled 5/min) |
| `POST /auth/refresh` | No | Refresh token rotation (10/min) |
| `POST /auth/logout` | Bearer | Revoke session + JTI |
| `POST /auth/register` | Bearer + `users:create` | Admin user creation |
| `POST /auth/change-password` | Bearer | Change password + revoke all sessions |
| `GET/POST/PUT/DELETE /features` | Bearer + RBAC | Feature CRUD |
| `GET/POST/PUT/DELETE /roles` | Bearer + RBAC | Role CRUD |
| `POST /roles/:id/permissions` | Bearer + `rbac:assign_permissions` | Assign permissions |
| `GET/POST/PUT/DELETE /permissions` | Bearer + RBAC | Permission CRUD |
| `GET/POST/PATCH/DELETE /webhook-endpoints` | Bearer + tenant | Webhook endpoint CRUD (requires `@RequireTenant()`) |
| `GET /health/liveness` | No | Process alive |
| `GET /health/readiness` | No | DB + Redis health |
| `GET /api/docs` | No | Swagger UI (development/test only) |

## Testing

| Layer | Location | Notes |
|-------|----------|-------|
| Unit | `src/**/*.spec.ts` | Jest, `rootDir: src` — **85 tests / 16 suites** |
| E2E | `test/*.e2e-spec.ts` | Requires PostgreSQL; includes tenant isolation scenarios |

CI enforces **≥ 85% coverage** (statements, branches, functions, lines) via `.github/workflows/ci.yml`.

## Further Reading

- [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) — Complete RBAC + PostgreSQL RLS multi-tenancy example (Projects CRUD)
- [docs/en/deployment.md](./deployment.md) — Railway, Render, Docker Compose and npm publish guide
