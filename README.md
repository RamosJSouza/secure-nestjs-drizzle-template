# NestJS Security Pro

[![CI](https://github.com/RamosJSouza/secure-nestjs-drizzle-template/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RamosJSouza/secure-nestjs-drizzle-template/actions/workflows/ci.yml)
[![CD](https://github.com/RamosJSouza/secure-nestjs-drizzle-template/actions/workflows/cd.yml/badge.svg)](https://github.com/RamosJSouza/secure-nestjs-drizzle-template/actions/workflows/cd.yml)
[![codecov](https://codecov.io/gh/RamosJSouza/secure-nestjs-drizzle-template/branch/main/graph/badge.svg)](https://codecov.io/gh/RamosJSouza/secure-nestjs-drizzle-template)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.44-C5F74F.svg)](https://orm.drizzle.team/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/ghcr.io-secure--nestjs--drizzle--template-2496ED.svg?logo=docker&logoColor=white)](https://github.com/RamosJSouza/secure-nestjs-drizzle-template/pkgs/container/secure-nestjs-drizzle-template)
[![Node](https://img.shields.io/badge/node-%3E%3D24.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

Production-ready secure backend architecture with NestJS, Drizzle ORM, RBAC, and JWT RS256.

## Why NestJS Security Pro

Most templates help you ship fast.
**NestJS Security Pro helps you ship fast and pass security review.**

It is designed for teams building SaaS, fintech, health, and enterprise products that must meet security and governance requirements such as:

- SOC 2 readiness (traceability, access control, audit evidence)
- GDPR-oriented controls (least privilege, event traceability, operational accountability)
- Internal security review and incident response workflows

Instead of assembling auth, RBAC, logging, health checks, and database patterns from scratch, you start from a hardened baseline and save weeks of architecture work.

## Value-Driven Features

- **Enterprise-Grade Auth (RS256 JWT)** — prevents shared-secret leakage risk with asymmetric keys.
- **Argon2id Password Hashing** — winner of the Password Hashing Competition; transparent migration from bcrypt on first login.
- **JTI Token Revocation** — every access token carries a unique ID; logout and password change revoke it instantly via Redis blocklist — no waiting for the 15-min TTL.
- **Refresh Token Rotation + Reuse Detection** — blocks replay attacks and revokes all session JTIs on theft detection.
- **Credential Stuffing Protection** — per-IP Redis counter; 20 failures/hour → 15-min IP block (HTTP 429) across all accounts.
- **Risk Engine** — every successful login is scored by 5 threat signals (new device, new IP, IP failure rate, recent lockout, token reuse); `critical` score (≥80) blocks login and revokes all sessions instantly.
- **currentPassword Verification on Change** — `POST /auth/change-password` requires the current password, preventing account takeover via stolen access tokens.
- **Session Limits + Device Fingerprinting** — max 10 sessions per user; oldest evicted with JTI revocation; device tracked via full SHA-256 hex of User-Agent + IP.
- **Explicit Logout** — `POST /auth/logout` revokes the DB session AND immediately invalidates the access token via JTI.
- **Audit-Ready Session Revocation** — preserves `revoked_at` history for forensic integrity.
- **Database-Driven RBAC** — avoids hardcoded roles; role changes take effect on the next request (no re-login required).
- **RBAC Audit Trail** — `assignPermissions` logs a before/after diff (`added`, `removed`) to the audit log.
- **Append-Only Audit Logging** — creates reliable evidence trails for compliance and incident analysis.
- **Fail-Fast Configuration Validation** — stops insecure startup in production when critical env vars are missing.
- **Two-Layer Rate Limiting** — global IP-level (`express-rate-limit`) + per-endpoint (`@nestjs/throttler`); login limited to 5 req/min per IP.
- **Swagger Disabled in Production** — the API blueprint is never publicly exposed in `NODE_ENV=production`.
- **Soft-Delete Auth Bypass Protection** — deleted users cannot authenticate; `remove()` sets `deletedAt` and `isActive = false` atomically.
- **PII-Safe Structured Logging** — Pino redacts `authorization`, `cookie`, `password`, and `refresh_token` fields before writing logs.
- **Correlation ID Injection Prevention** — UUID v4 validation on `X-Correlation-Id`; invalid values discarded and replaced server-side.
- **Production Observability** — structured logs with correlation IDs, liveness/readiness probes, graceful shutdown.
- **Drizzle ORM + Migration Workflow** — predictable schema evolution with explicit SQL migrations.
- **Multi-Tenancy via PostgreSQL RLS** — `TenantDatabaseService.withTenant()` wraps every query in a transaction with `set_config('app.current_tenant', orgId, true)`; belt-and-suspenders with explicit `WHERE organization_id` clause.
- **Resilient Webhooks** — BullMQ async delivery with HMAC-SHA256 signing; graceful degradation when Redis is unavailable (`DISABLE_REDIS=true`).
- **CI/CD & Security Pipeline** — GitHub Actions: lint → type-check → coverage ≥ 85% → npm audit → Docker build → Trivy scan; weekly CodeQL + Snyk scan; Dependabot for npm/Actions/Docker.

## Practical Example: RBAC + Multi-Tenant Endpoint

Protect a route so that users can only access **their own organization's data**, with both application-level RBAC and PostgreSQL RLS acting as independent isolation layers:

```typescript
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequireTenant()                         // 403 if user has no organization
@Controller('projects')
export class ProjectsController {
  @Get()
  @RequirePermissions('project:read')    // DB-driven RBAC check
  findAll(@Req() req: Request) {
    const orgId = (req.user as any).organizationId;
    return this.projectsService.findAll(orgId);
  }
}

// Service: belt-and-suspenders — explicit WHERE + RLS
findAll(orgId: string) {
  return this.tenantDb.withTenant(orgId, (db) =>
    db.select().from(projects)
      .where(eq(projects.organizationId, orgId))  // explicit guard
    // PostgreSQL RLS also filters via app.current_tenant session var
  );
}
```

See [docs/examples/rbac-multi-tenant.md](./docs/examples/rbac-multi-tenant.md) for the complete working example with DTOs, seed, RLS SQL, and E2E test.

## Architecture Snapshot

- **Framework:** NestJS 11
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** JWT RS256 (access 15m, refresh 7d) · Argon2id hashing
- **Authorization:** RBAC (`Feature -> Permission -> RolePermission -> Role -> User`)
- **Cache/Infra:** Redis
- **Rate Limiting:** express-rate-limit (IP-level) + @nestjs/throttler (per-endpoint)
- **Observability:** Pino + correlation ID + health endpoints

## Quick Start

```bash
cp .env.example .env
npm install
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
npm run db:migrate
npm run seed:rbac
npm run dev
```

Open API docs: `http://localhost:3000/api/docs` *(development only — disabled in production)*

### Database Commands (Drizzle)

```bash
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply migrations
npm run db:studio     # open Drizzle Studio
```

## Environment Essentials

- **Node.js:** ≥ 24.0.0 (LTS Krypton) — use `.nvmrc` ou `nvm use` para fixar a versão
- Runtime DB: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL`
- Drizzle tooling: `DATABASE_URL` (optional, preferred for CLI tooling)
- Auth keys: `PRIVATE_KEY`, `PUBLIC_KEY`
- Security: `ALLOWED_ORIGINS` (required in production), `NODE_ENV`

See full details in:

- `docs/en/configuration.md`
- `docs/pt-br/configuracao.md`

## Security Hardening Summary

| Control | Implementation |
|---------|----------------|
| Password hashing | Argon2id (64 MiB / 3t / 4p) |
| Legacy hash migration | Transparent bcrypt → Argon2id on login |
| **Access token revocation** | **JTI UUID per token + Redis blocklist (O(1) per request)** |
| **Credential stuffing** | **Per-IP Redis counter; 20 fail/h → 15-min block (HTTP 429)** |
| **Session limits** | **Max 10 per user; oldest evicted with JTI revocation** |
| **Device fingerprinting** | **Full SHA-256 hex of (User-Agent + IP) stored per session** |
| **Risk Engine** | **5-signal login risk scoring; `critical` (≥80) → login blocked + all sessions revoked** |
| **currentPassword on change** | **`change-password` verifies current password before applying new one** |
| **PermissionGuard safety** | **Fail-open with WARN log if `@RequirePermissions` absent; 403 never exposes permission names** |
| **RBAC audit trail** | **`assignPermissions` logs before/after diff** |
| **PII redaction** | **Pino redacts auth header, cookie, passwords, refresh_token** |
| **Correlation ID validation** | **UUID v4 format enforced; injected values discarded** |
| Auth rate limit | 5 req/min per IP on `/auth/login` |
| Refresh rate limit | 10 req/min per IP on `/auth/refresh` |
| Global rate limit | 300 req/15min per IP |
| Security headers | Helmet with CSP |
| Swagger | Disabled in `NODE_ENV=production` |
| CORS | Parsed, sanitized; required in production |
| Trust proxy | Configured for real-IP rate limiting |
| UUID validation | `ParseUUIDPipe` on all route params |
| Password policy | Min 8, max 72, uppercase+lowercase+digit |
| User enumeration | Uniform error for all login failures |
| Soft-delete bypass | `deletedAt` + `isActive` set atomically |
| Password in req.user | Stripped in `JwtStrategy.validate()` |
| Role staleness | DB reload on every request — JWT `roleId` never trusted |

## Compliance-Oriented Use Cases

- Build an admin backend with permissioned operations and complete auditability.
- Enforce secure token lifecycle with replay detection and controlled session invalidation.
- Provide structured logs and trace IDs for incident response and security operations.
- Establish a reusable backend baseline for regulated product teams.

## 📚 Deep Dive & Tutorials

Technical references from Ramos da Informatica (replace/add links as needed):

- [Security in Docker: Lessons from Real Incidents](https://ramosdainformatica.com.br/seguranca-em-docker-licoes-de-incidentes-reais/)
- [How to Install and Configure SonarQube for Node.js Projects](https://ramosdainformatica.com.br/como-instalar-e-configurar-sonarqube-para-projetos-node-js/)
- [Redis Performance with Relational Databases](https://ramosdainformatica.com.br/performance-em-aplicacoes-com-bancos-de-dados-relacionais-usando-redis/)
- [Kubernetes Explained with Practical Diagrams](https://ramosdainformatica.com.br/kubernetes-explicado-com-diagramas-que-fazem-sentido/)
- [Elasticsearch with Node.js: Practical Guide](https://ramosdainformatica.com.br/o-que-e-o-elasticsearch-e-como-instalar-e-utilizar-com-o-node/)

Placeholders to customize with your own authority content:

- [NestJS Security Blueprint for SOC2](https://ramosdainformatica.com.br/nestjs-security-blueprint-arquitetura-de-backend-pronta-para-soc2/)
- [JWT Rotation and Session Defense in Practice](https://ramosdainformatica.com.br/rotacao-de-jwt-e-defesa-de-sessao-na-pratica-com-nestjs/)


## Security

For vulnerability disclosure, see [SECURITY.md](./SECURITY.md). Compliance evidence and audit trail documentation: [docs/en/compliance.md](./docs/en/compliance.md).

## Contribute or Hire Expert Help

- **Contribute:** open issues, improve docs, add tests, or submit hardening improvements via PR.
- **Consulting:** if your team needs secure architecture, compliance-focused backend design, or modernization support, reach out:
  - Website: [ramosdainformatica.com.br](https://ramosdainformatica.com.br/)
  - LinkedIn: [Ramos de Souza Janones](https://www.linkedin.com/in/ramos-souza/)

## Authority Note (PT-BR)

Este projeto e sua arquitetura sao mantidos por **Ramos de Souza Janones**, engenheiro senior com foco em Node.js/NestJS, seguranca de aplicacoes e arquiteturas prontas para producao e auditoria.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/en/architecture.md](./docs/en/architecture.md) | System architecture and module overview |
| [docs/en/authentication.md](./docs/en/authentication.md) | JWT RS256 auth flow, refresh rotation, revocation |
| [docs/en/rbac.md](./docs/en/rbac.md) | RBAC model, PermissionGuard, permission seeding |
| [docs/en/security.md](./docs/en/security.md) | Risk engine, rate limiting, Argon2id, audit log |
| [docs/en/observability.md](./docs/en/observability.md) | Pino logging, correlation ID, health endpoints |
| [docs/en/configuration.md](./docs/en/configuration.md) | All environment variables with validation schema |
| [docs/en/compliance.md](./docs/en/compliance.md) | SOC 2 / GDPR / LGPD / PCI-DSS control mapping |
| [docs/en/deployment.md](./docs/en/deployment.md) | Railway, Render, Docker Compose deploy guide + npm publish |
| [docs/examples/rbac-multi-tenant.md](./docs/examples/rbac-multi-tenant.md) | **Full RBAC + PostgreSQL RLS multi-tenancy example** |
| `docs/pt-br/` | Portuguese translations of all docs |
