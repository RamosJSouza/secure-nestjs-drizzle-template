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
- `REDIS_HOST`, `REDIS_PORT` (default: 6379)

### Email (Resend)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` (optional)

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
