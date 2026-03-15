# Compliance Evidence Guide

This document maps each compliance requirement (SOC 2 Type II, GDPR, LGPD, PCI-DSS Req 8) to the corresponding implementation in this codebase, providing auditors with evidence trails and control references.

---

## SOC 2 Type II — Trust Service Criteria

### CC6 — Logical and Physical Access Controls

| Control | Evidence | File/Location |
|---------|----------|---------------|
| CC6.1 — Access control with least privilege | RBAC: `Feature → Permission → RolePermission → Role → User`. Role changes take effect on the **next request** (no stale JWT roleId) | `src/modules/rbac/` |
| CC6.2 — New access requests authorized | `POST /rbac/roles/:roleId/permissions` requires `PATCH /rbac/users/:userId/role` — separated authorization flow | `src/modules/rbac/rbac.controller.ts` |
| CC6.3 — Role revocation takes effect immediately | `PermissionGuard` queries DB on every request; `JwtStrategy.validate()` loads fresh user+role | `src/common/guards/permission.guard.ts`, `src/auth/strategy/jwt.strategy.ts` |
| CC6.6 — Restrict access for terminated employees | `soft-delete` sets `deletedAt` + `isActive=false` atomically; all auth checks filter `isNull(deletedAt)` | `src/users/users.service.ts` |
| CC6.7 — Transmission encryption | HTTPS enforced via HSTS (`maxAge: 31536000, includeSubDomains, preload`) in production | `src/main.ts` |
| CC6.8 — Prevent unauthorized removal | Append-only audit log table (`audit_logs`) — no `DELETE` or `UPDATE` paths exist | `src/modules/audit/` |

### CC7 — System Operations

| Control | Evidence | File/Location |
|---------|----------|---------------|
| CC7.1 — Detect anomalies | Risk Engine: 5 signals (new device, new IP, IP failure rate, recent lockout, token reuse). Score ≥80 → login blocked + all sessions revoked | `src/security/risk-engine/risk-engine.service.ts` |
| CC7.2 — Monitor for unauthorized access | `SuspiciousActivityService` tracks per-IP failed attempts; `SecurityEventService` logs typed events | `src/security/detection/`, `src/security/events/` |
| CC7.3 — Evaluate and respond to threats | All security events logged via `SecurityEventService` with `SecurityEventType` enum | `src/security/events/security-event.service.ts` |

### CC8 — Change Management

| Control | Evidence | File/Location |
|---------|----------|---------------|
| CC8.1 — Authorized changes | All RBAC changes logged with before/after diff in audit log | `src/modules/rbac/services/rbac.service.ts` — `assignPermissions()` |

### CC9 — Risk Mitigation

| Control | Evidence | File/Location |
|---------|----------|---------------|
| CC9.2 — Vendor/partner risk management | `npm audit` in pre-commit hook and CI workflow; Dependabot weekly scans | `.husky/pre-commit`, `.github/workflows/security.yml` |

---

## GDPR / LGPD — Data Protection

### Article 5 — Principles of Data Processing

| Principle | Implementation | Evidence |
|-----------|---------------|---------|
| **Integrity & Confidentiality** | Argon2id hashing (64 MiB / 3t / 4p); bcrypt migration on login | `src/users/users.service.ts` — `hashPassword()` |
| **Data minimization** | JWT access token: `{sub, jti}` only — no email, role, PII in payload. Refresh token: `{sub}` only. Eliminates stale role claims and PII leakage via client-side decoding | `src/auth/auth.service.ts` — token generation |
| **Accountability** | Append-only audit logs per action with `userId`, `action`, `entityType`, `entityId`, `details`, `createdAt` | `src/modules/audit/audit.service.ts` |

### Article 25 — Data Protection by Design

| Requirement | Implementation | Evidence |
|-------------|---------------|---------|
| **PII redaction in logs** | Pino redacts: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.refresh_token` | `src/logger/logger.module.ts` |
| **Correlation ID validation** | UUID v4 enforced on `X-Correlation-Id`; invalid values replaced server-side | `src/common/middleware/correlation-id.middleware.ts` |
| **Multi-tenant isolation** | PostgreSQL RLS policies (see `src/database/rls/0001_enable_rls.sql`); `TenantDatabaseService.withTenant()` wraps queries | `src/tenant/` |

### Article 32 — Security of Processing

| Measure | Implementation | Evidence |
|---------|---------------|---------|
| Pseudonymization | User IDs are UUIDs v4 (no sequential IDs); tokens use opaque JTI | Schema: `src/database/schema/users.ts` |
| Encryption in transit | HSTS + TLS (infra-level); `upgrade-insecure-requests` CSP directive; `style-src` and `script-src` restricted to `'self'` in production (no `'unsafe-inline'`) | `src/main.ts` |
| Ongoing confidentiality | JTI blocklist (Redis) for immediate token revocation | `src/security/token-revocation/token-revocation.service.ts` |
| Restoration capability | PostgreSQL with `deletedAt` soft-delete (data retained, access revoked) | `src/database/schema/users.ts` |
| Regular testing | CI pipeline runs on every push/PR; weekly security scan via GitHub Actions | `.github/workflows/ci.yml`, `.github/workflows/security.yml` |

---

## PCI-DSS Requirement 8 — Identify Users and Authenticate Access

| Req | Description | Implementation |
|-----|-------------|---------------|
| 8.2 | Unique user IDs | UUID v4 per user, never reused | Schema |
| 8.3.6 | Minimum password complexity | Min 8 chars, max 72, uppercase + lowercase + digit | DTOs via `class-validator` |
| 8.3.9 | Password change requires current password | `POST /auth/change-password` verifies `currentPassword` before applying change | `src/auth/auth.service.ts` |
| 8.6.1 | Lockout after failed attempts | 5 failed logins → 15-min lockout; `SuspiciousActivityService` counters per IP | `src/users/users.service.ts`, `src/security/detection/` |
| 8.6.2 | Session management | Access token 15m TTL; refresh 7d; max 10 sessions/user; oldest evicted | `src/auth/auth.service.ts` |
| 8.6.3 | MFA for non-console access | Not implemented (optional extension point) | — |

---

## Audit Log Schema

The `audit_logs` table stores all privileged actions. **No `DELETE` or `UPDATE` paths exist** — append-only by design.

```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100) NOT NULL,   -- e.g. 'ASSIGN_PERMISSION', 'LOGIN_BLOCKED'
  entity_type  VARCHAR(100),            -- e.g. 'user', 'role', 'session'
  entity_id    UUID,
  details      JSONB,                   -- before/after diff, risk scores, etc.
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Security Event Types (SecurityEventType enum)

| Event | Trigger |
|-------|---------|
| `SESSION_LIMIT_EVICTION` | Max sessions exceeded → oldest evicted |
| `TOKEN_REUSE_DETECTED` | Refresh token reuse attempt detected |
| `LOGIN_BLOCKED_RISK` | Risk Engine score ≥ 80 → all sessions revoked |
| `IP_BLOCKED_STUFFING` | Credential stuffing counter threshold hit |
| `PASSWORD_CHANGED` | Successful password change |
| `ROLE_ASSIGNED` | Role assigned to user |
| `PERMISSION_ASSIGNED` | Permission diff logged (added/removed) |

---

## PII Redaction Evidence

Pino is configured with the following `redact` paths. These fields are **never** written to logs:

```typescript
redact: [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.refresh_token',
  'res.headers["set-cookie"]',
]
```

---

## Multi-Tenancy Isolation Evidence

1. **Row-Level Security (RLS):** `src/database/rls/0001_enable_rls.sql` — applied once per environment via `psql -f`.
2. **Belt-and-suspenders WHERE clause:** All `WebhookEndpointsService` queries include explicit `WHERE organization_id = $orgId` even with RLS active.
3. **Context isolation:** `TenantDatabaseService.withTenant(orgId, fn)` wraps queries in a transaction with `set_config('app.current_tenant', orgId, true)` — `IS_LOCAL=true` prevents context bleed across requests.
4. **E2E test:** `test/tenant-isolation.e2e-spec.ts` validates cross-tenant data isolation (11 scenarios).

---

## How to Generate Compliance Reports

```bash
# 1. Export audit logs (last 30 days)
psql $DATABASE_URL -c "
  SELECT user_id, action, entity_type, entity_id, details, ip_address, created_at
  FROM audit_logs
  WHERE created_at >= NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
" --csv > audit-export-$(date +%Y%m%d).csv

# 2. Run security audit
npm audit --json > security-audit-$(date +%Y%m%d).json

# 3. Run test coverage report
npm run test:cov
# Coverage HTML report: ./coverage/lcov-report/index.html
```
