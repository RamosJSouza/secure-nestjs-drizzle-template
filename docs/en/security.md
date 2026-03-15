# Security

## Authentication Model

- **JWT RS256:** Asymmetric signing. Private key never leaves the server; public key can be distributed to validators.
- **Short-lived access tokens:** 15 minutes limit exposure.
- **JTI (JWT ID) revocation:** Every access token carries a unique `jti` UUID. On logout or password change, the JTI is added to a Redis blocklist. The `JwtStrategy` performs an O(1) Redis lookup before accepting any token — revocation takes effect *immediately*, even within the 15-minute TTL. Fails OPEN if Redis is unavailable (availability > strict revocation during outage).
- **Refresh token rotation:** Each refresh invalidates the previous token and issues a new one.
- **Reuse detection:** If a revoked refresh token is reused, all sessions for that user are revoked immediately and all active access token JTIs are added to the blocklist.
- **Password change:** Revokes all active sessions and all associated JTIs across all devices immediately.
- **Logout:** `POST /auth/logout` revokes the specific session and its access token JTI immediately.
- **Session limits:** Maximum 10 concurrent active sessions per user. Oldest session is evicted (and its JTI revoked) when the limit is exceeded — prevents session table flooding.
- **Device fingerprinting:** SHA-256 hash of `User-Agent + IP` stored per session for forensics.

## Password Hashing

Passwords are hashed with **Argon2id** — the winner of the Password Hashing Competition, recommended by OWASP.

| Parameter | Value | Reason |
|-----------|-------|--------|
| Algorithm | Argon2id | Resistant to side-channel and GPU/ASIC brute force |
| Memory cost | 64 MiB | Raises attacker cost per attempt |
| Time cost | 3 iterations | ~100ms per hash on modern hardware |
| Parallelism | 4 threads | Saturates attacker cores |
| Max length | 72 chars | Enforced by DTO to prevent bcrypt-family padding attacks |

### Transparent bcrypt Migration

Existing bcrypt hashes in the database continue to work. On the first successful login, the hash is **silently rehashed with Argon2id** without any user-visible change or forced reset. New hashes are always Argon2id.

## Authorization

- All mutation endpoints require `JwtAuthGuard` (valid Bearer token).
- RBAC enforced via `PermissionGuard` and `@RequirePermissions`.
- Permission check is database-backed (`RolePermission`) rather than hardcoded.
- UUID path parameters are validated with `ParseUUIDPipe` — invalid values return `400` before hitting the database.
- `PermissionGuard` applied without `@RequirePermissions` emits a `WARN` log (route is RBAC-unprotected) but allows the request through — this is intentional fail-open behavior for routes protected by other means.
- `403 Forbidden` responses never include the required permission name — prevents attackers from mapping the permission system via error responses.

## Risk Engine

Every successful login is scored by `RiskEngineService` using five signals queried in parallel:

| Signal | Score contribution |
|--------|--------------------|
| New device (fingerprint not seen before) | +20 |
| New IP on a known device | +10 |
| IP failure rate 5–9 in last hour | +10 |
| IP failure rate 10–14 in last hour | +20 |
| IP failure rate ≥ 15 in last hour | +30 |
| Account was locked in last 60 minutes | +20 |
| Recent token reuse event | +50 |

Risk levels and actions:

| Score | Level | Action |
|-------|-------|--------|
| 0–29 | `low` | Login proceeds normally |
| 30–59 | `medium` | Login proceeds; `security.risk.elevated_login` audit event logged |
| 60–79 | `high` | Login proceeds; `security.risk.elevated_login` audit event logged |
| 80+ | `critical` | **Login blocked (HTTP 403)**; all sessions revoked; all JTIs added to Redis blocklist; `security.risk.login_blocked` audit event logged |

All signal detectors fail **open** (return 0 on error) — a Redis or DB outage does not block logins.

## Password Change Protection

`POST /auth/change-password` requires the caller to provide their **current password** alongside the new one. The current password is verified before any change is made. This prevents account takeover via a stolen access token — even with a valid Bearer token, the attacker cannot change the password without knowing the current one.

## Password Requirements

All password DTOs (register, change-password, create-user) enforce:

- Minimum **8 characters**
- Maximum **72 characters** (prevents hash-length attacks)
- At least one **uppercase letter**
- At least one **lowercase letter**
- At least one **digit**

## Rate Limiting — Two Layers

### Layer 1: IP-Level (`express-rate-limit`)

| Limit | Window | Scope |
|-------|--------|-------|
| 300 requests | 15 minutes | All routes per IP |
| Exempt | — | `/health/liveness`, `/health/readiness` |

Provides broad DDoS and abuse protection. Requires `trust proxy` to be configured correctly (see below).

### Layer 2: Per-Endpoint (`@nestjs/throttler`)

| Named limiter | Route | Limit | Window |
|---------------|-------|-------|--------|
| `auth` | `POST /auth/login` | 5 requests | 1 minute per IP |
| `auth` | `POST /auth/refresh` | 10 requests | 1 minute per IP |
| `default` | All other routes | 120 requests | 1 minute per IP |

The `auth` limiter is applied explicitly via `@Throttle({ auth: ... })` on the controller methods. Admin-only endpoints (register) skip the auth limiter since they are already protected by `JwtAuthGuard + PermissionGuard`.

## HTTP Hardening

| Layer | Implementation |
|-------|----------------|
| Security headers | Helmet (CSP, HSTS, X-Frame-Options, etc.) |
| CSP | `default-src 'self'`; `script-src` and `style-src` include `'unsafe-inline'` in dev only (Swagger UI); production enforces `'self'` for both |
| `crossOriginEmbedderPolicy` | Enabled in production only |
| Rate limiting | Two-layer (see above) |
| CORS | Restricted to `ALLOWED_ORIGINS` (required and validated in production) |
| Input validation | `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true` |
| Config validation | Joi schema — fail-fast on startup |
| Swagger | **Disabled in production** (`NODE_ENV=production`) |

## Trust Proxy

`app.set('trust proxy', 1)` is configured so that `req.ip` reflects the real client IP behind a reverse proxy (Nginx, AWS ALB, Cloudflare). Without this setting, all clients share the load balancer's IP — breaking rate limiting and making audit logs useless.

If your deployment has multiple proxy hops, adjust the trust level accordingly:
```bash
# Trust only the first proxy hop (most deployments)
trust proxy = 1

# Trust a specific subnet (e.g., Kubernetes ingress)
trust proxy = 10.0.0.0/8
```

## CORS

`ALLOWED_ORIGINS` is parsed and sanitized:
- In **development**: defaults to `true` (allow all) if not set.
- In **production**: must be explicitly set to comma-separated URLs (enforced by Joi). Defaults to `false` if parsing yields an empty list.

## Account Protection

- **Lockout:** 5 failed logins → 15-minute lockout.
- **Credential stuffing detection:** Per-IP failure counter in Redis (`sec:fail:ip:{ip}`). After 20 failures in 1 hour from the same IP, all login attempts from that IP are blocked for 15 minutes (HTTP 429). The counter increments even for nonexistent accounts to prevent probing.
- **Audit:** `auth.account.locked`, `auth.refresh_token_reuse_detected`, `auth.password.changed`, and IP block events are all logged.
- **Deactivation:** Inactive users (`isActive = false`) receive `401` on any authenticated request.
- **Soft-delete:** Deleted users (`deletedAt IS NOT NULL`) are excluded from all queries — they cannot log in even if `isActive` was not updated separately. The `remove()` method sets both `deletedAt` and `isActive = false` atomically.
- **Password stripped from `req.user`:** The `JwtStrategy.validate()` method returns the user object without the `password` field. The hash is never present in the request context.
- **User enumeration prevention:** Login returns a uniform `"Invalid credentials"` message for all failure paths (nonexistent user, inactive, locked, wrong password).
- **Role always reloaded from DB:** `JwtStrategy` reloads the user from the database on every request — the `roleId` in the JWT claim is never trusted. Role changes take effect immediately without requiring re-login.

## Permission Key Format

Permission `action` fields are validated with `@Matches(/^[a-z0-9_-]+$/)` to enforce slug format. This prevents malformed permission keys like `create OR 1=1` from being stored.

## RBAC Audit Trail

Every call to `assignPermissions` is audited with a before/after diff:
- `added`: permission IDs newly granted
- `removed`: permission IDs revoked
- Logged as `rbac.role.permissions_assigned` in the audit log, including the actor's user ID.

## Structured Logging and PII Protection

Pino's `redact` option strips sensitive fields before log entries are written:

| Redacted field | Replacement |
|----------------|-------------|
| `req.headers.authorization` | `[REDACTED]` |
| `req.headers.cookie` | `[REDACTED]` |
| `req.body.password` | `[REDACTED]` |
| `req.body.newPassword` | `[REDACTED]` |
| `req.body.confirmPassword` | `[REDACTED]` |
| `req.body.refresh_token` | `[REDACTED]` |

## Correlation ID Injection Prevention

The `X-Correlation-Id` header is validated against UUID v4 format before being used as the request's correlation ID. Invalid or injected values are silently discarded and replaced with a server-generated UUID. This prevents log injection via the header.

## Production Requirements

- `PRIVATE_KEY` and `PUBLIC_KEY` must be non-empty RSA keys.
- `DB_SSL=true` for encrypted database connections.
- `ALLOWED_ORIGINS` must list allowed frontend URLs.
- `NODE_ENV=production` disables Swagger UI.
- Seed credentials must be changed after first deploy.
- Deploy behind a reverse proxy and configure `trust proxy` appropriately.
