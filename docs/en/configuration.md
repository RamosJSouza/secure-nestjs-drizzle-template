# Configuration

The project uses `@nestjs/config` and Joi for environment validation.

## Environment Variables

The `.env` file must be at the project root.

### Application
- `NODE_ENV`: `development`, `production`, or `test`. Default: `development`
- `PORT`: Server port. Default: `3000`
- `APP_NAME`: Application name (optional)

### Database (PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `DB_SSL`: `true` for TLS (required in production)
- `DB_POOL_MAX`: Connection pool max. Default: `20`
- `DATABASE_URL`: optional connection string for Drizzle tooling (`db:generate`, `db:migrate`, `db:studio`)

In production, schema sync is disabled; use Drizzle migrations only.

### Authentication (JWT RS256)
- `PRIVATE_KEY`: RSA private key in PEM format (signs tokens)
- `PUBLIC_KEY`: RSA public key in PEM format (verifies tokens)

Generate keys:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

In `.env`, paste PEM content as a single line, replacing newlines with `\n`. Both required in production.

### CORS
- `ALLOWED_ORIGINS`: Comma-separated URLs (e.g. `https://admin.example.com`). **Required in production.**

### Redis
- `REDIS_HOST`: Default `localhost`
- `REDIS_PORT`: Default `6379`
- `REDIS_PASSWORD`: Optional
- `DISABLE_REDIS`: Set to `true` to skip BullMQ initialization (webhook CRUD remains available; async delivery queue is disabled). Also switches `AppCacheModule` to in-memory cache. Default in `.env.example`: `true` (local dev without Redis).

### RBAC Cache
- `RBAC_CACHE_TTL`: Permission cache TTL in milliseconds. Default: `300000` (5 minutes). Used by `RbacService` and `AppCacheModule`.

### Security Guards
- `PERMISSION_GUARD_STRICT`: Set to `true` to make `PermissionGuard` fail-closed (HTTP 403) when `@RequirePermissions` is absent. Default: `false` (fail-open with WARN log — allows routes protected by other means).

### Application URL
- `APP_URL`: Base URL for links in transactional emails (password reset, email verification). Default: `http://localhost:3000`

### Email (Nodemailer / SMTP)
- `SMTP_HOST`, `SMTP_PORT` (default `587`), `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` (optional display name)
- **Development:** when `SMTP_HOST` is empty, `NodemailerAdapter` creates an Ethereal test account automatically; preview URL is logged to the console.
- **Production:** configure real SMTP credentials; links use `APP_URL`.

### Account Recovery & Verification
- `PASSWORD_RESET_TOKEN_TTL_SECONDS`: Opaque reset token TTL. Default: `900` (15 min)
- `EMAIL_VERIFICATION_TOKEN_TTL_SECONDS`: Verification token TTL. Default: `86400` (24 h)
- `PASSWORD_CHANGE_GRACE_PERIOD_HOURS`: Hours after password change during which sensitive routes are blocked. Default: `24`
- `FORGOT_PASSWORD_MIN_RESPONSE_MS`: Minimum response time for forgot-password (timing attack mitigation). Default: `250`

## Validation

The Joi schema in `src/config/validation.schema.ts`:
- Fails fast on startup with all validation errors
- Requires `PRIVATE_KEY` and `PUBLIC_KEY` when `NODE_ENV=production`
- Requires `DB_SSL=true` in production
- Requires `ALLOWED_ORIGINS` in production (URL format)

## Drizzle Scripts

- `npm run db:generate` — generate migration files from schema changes
- `npm run db:migrate` — apply migrations
- `npm run db:studio` — inspect the database via Drizzle Studio
