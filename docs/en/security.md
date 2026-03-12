# Security

## Authentication Model

- **JWT RS256:** Asymmetric signing. Private key never leaves the server; public key can be distributed to validators.
- **Short-lived access tokens:** 15 minutes limit exposure.
- **Refresh token rotation:** Each refresh invalidates the previous token and issues a new one.
- **Reuse detection:** If a revoked refresh token is reused, all sessions for that user are revoked immediately.
- **Password change:** Revokes all active sessions across all devices immediately.
- **Logout:** `POST /auth/logout` revokes the specific session tied to the provided refresh token.

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
| CSP | `default-src 'self'`; `style-src` relaxed for Swagger UI in dev |
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
- **Audit:** `auth.account.locked` and `auth.refresh_token_reuse_detected` logged.
- **Deactivation:** Inactive users (`isActive = false`) receive `401` on any authenticated request.
- **Soft-delete:** Deleted users (`deletedAt IS NOT NULL`) are excluded from all queries — they cannot log in even if `isActive` was not updated separately. The `remove()` method sets both `deletedAt` and `isActive = false` atomically.
- **Password stripped from `req.user`:** The `JwtStrategy.validate()` method returns the user object without the `password` field. The hash is never present in the request context.
- **User enumeration prevention:** Login returns a uniform `"Invalid credentials"` message for all failure paths (nonexistent user, inactive, locked, wrong password).

## Permission Key Format

Permission `action` fields are validated with `@Matches(/^[a-z0-9_-]+$/)` to enforce slug format. This prevents malformed permission keys like `create OR 1=1` from being stored.

## Production Requirements

- `PRIVATE_KEY` and `PUBLIC_KEY` must be non-empty RSA keys.
- `DB_SSL=true` for encrypted database connections.
- `ALLOWED_ORIGINS` must list allowed frontend URLs.
- `NODE_ENV=production` disables Swagger UI.
- Seed credentials must be changed after first deploy.
- Deploy behind a reverse proxy and configure `trust proxy` appropriately.
