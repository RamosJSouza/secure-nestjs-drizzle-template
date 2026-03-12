# Architecture

## Overview

Prime Nest is a production-ready NestJS backend with a modular structure designed for scalability and maintainability. The system is **single-tenant** with an `Organization` entity placeholder for future multi-tenancy evolution.

## Module Structure

| Module | Purpose |
|--------|---------|
| AuthModule | Login, refresh, logout, register, change-password |
| UsersModule | User management (creation via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| OrganizationsModule | Organization entity (placeholder) |
| AuditModule | Append-only audit logging |
| HealthModule | Liveness and readiness probes |
| GracefulShutdownModule | Clean shutdown handling |
| LoggerModule | Pino + Correlation ID |
| ThrottlerModule | Per-endpoint rate limiting (`@nestjs/throttler`) |

## Data Flow

```
User → Role → RolePermission → Permission → Feature
```

Access control is enforced at the route level via `JwtAuthGuard` and `PermissionGuard` with `@RequirePermissions('feature:action')`.

## Directory Structure

```
src/
├── auth/              # Authentication flows
├── common/            # Guards, decorators
├── config/            # Environment validation (Joi)
├── logger/            # Pino, correlation ID middleware
├── database/          # Drizzle database module and schema
├── migrations/        # Seed scripts
├── modules/
│   ├── audit/         # Audit log
│   ├── health/        # Health checks
│   ├── organizations/ # Organization placeholder
│   └── rbac/          # RBAC entities and services
├── users/             # UsersService
└── main.ts
```

## Design Decisions

- **No schema sync in production** — Drizzle migrations only.
- **Fail-fast validation** — Joi schema validates on startup; production enforces required vars.
- **Append-only audit** — No updates or deletes on audit records.
- **Swagger disabled in production** — `NODE_ENV=production` prevents `/api/docs` from being registered. Available only in development and test environments.
- **Two-layer rate limiting** — `express-rate-limit` for broad IP-level protection; `@nestjs/throttler` for fine-grained per-endpoint throttling (especially critical auth routes).
- **Argon2id password hashing** — Replaces bcrypt; transparent migration on first login.
- **Trust proxy enabled** — Ensures real client IPs are used for rate limiting and audit logs when deployed behind Nginx/ALB.

## Database Layer (Drizzle)

- Runtime database access uses `DatabaseService` with `drizzle-orm` and `pg` pool.
- Schema definitions live in `src/database/schema`.
- SQL migrations are generated/applied via `drizzle-kit` using `drizzle.config.ts`.
- All user queries filter `deletedAt IS NULL` — soft-deleted users are fully excluded.
