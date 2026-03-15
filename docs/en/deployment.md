# Deployment Guide

## Option A — Railway (Recommended for Demo)

Railway detects the `Dockerfile` automatically and provides managed PostgreSQL and Redis.

### 1. Create services on Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project and services
railway init          # creates a new Railway project
railway add postgres  # managed PostgreSQL (Railway provides DATABASE_URL)
railway add redis     # managed Redis (Railway provides REDIS_URL)
```

### 2. Required environment variables

Set these in **Railway → Project → Variables**:

```env
NODE_ENV=production
PORT=3000

# PostgreSQL — Railway injects DATABASE_URL automatically
# Or set individually:
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_DATABASE=${{Postgres.PGDATABASE}}
DB_SSL=true

# Redis — Railway injects REDIS_URL
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}
REDIS_PASSWORD=${{Redis.REDISPASSWORD}}

# JWT RS256 keys (single-line with \n escapes)
# Generate with: bash scripts/rotate-jwt-keys.sh
PRIVATE_KEY=<single-line RSA private key with \n>
PUBLIC_KEY=<single-line RSA public key with \n>

# CORS — your frontend domain
ALLOWED_ORIGINS=https://your-frontend.railway.app

# Optional: strict permission guard
PERMISSION_GUARD_STRICT=true
```

> **Tip:** Use `scripts/rotate-jwt-keys.sh` to generate keys in single-line format ready for environment variables.

### 3. Generate RSA keys for production

```bash
bash scripts/rotate-jwt-keys.sh
# Outputs PRIVATE_KEY and PUBLIC_KEY as single-line env vars
# Copy the output directly into Railway Variables
```

### 4. Deploy

```bash
railway up
# Railway builds the Dockerfile, runs migrations via docker-entrypoint.sh, starts the app
```

### 5. Run initial seed

```bash
railway run npm run seed:rbac
```

### 6. Verify health endpoints

```bash
curl https://your-app.railway.app/health/liveness
# → { "status": "ok" }

curl https://your-app.railway.app/health/readiness
# → { "status": "ok", "info": { "database": {...}, "redis": {...} } }
```

---

## Option B — Render

### 1. Create Web Service

- Go to [render.com](https://render.com) → New → Web Service
- Connect GitHub repo `RamosJSouza/secure-nestjs-drizzle-template`
- **Environment:** Docker
- **Dockerfile path:** `./Dockerfile`
- **Health check path:** `/health/readiness`

### 2. Add Managed PostgreSQL and Redis

- Dashboard → New → PostgreSQL (Render provides `DATABASE_URL`)
- Dashboard → New → Redis (Render provides `REDIS_URL`)

### 3. Environment variables

Same as Railway above. Render auto-injects `DATABASE_URL` and `REDIS_URL` when services are linked.

---

## Option C — Docker Compose (Self-hosted / VPS)

```bash
# Clone the repo
git clone https://github.com/RamosJSouza/secure-nestjs-drizzle-template.git
cd secure-nestjs-drizzle-template

# Configure environment
cp .env.example .env
# Edit .env with your values

# Generate RSA keys
bash scripts/rotate-jwt-keys.sh >> .env

# Start all services
docker compose up -d

# Run migrations and seed
docker compose exec app npm run db:migrate
docker compose exec app npm run seed:rbac
```

---

## Publishing to npm

This package is published as `secure-nestjs-drizzle-template` on the npm registry.

### Manual publish

```bash
# 1. Build the project
npm run build

# 2. Login to npm
npm login

# 3. Publish (public access, configured in publishConfig)
npm publish
```

### Automated publish via GitHub Actions

The CD workflow (`.github/workflows/cd.yml`) publishes automatically on `v*.*.*` tags:

```bash
# Create and push a release tag
git tag v1.0.1
git push origin v1.0.1
# → triggers cd.yml: builds multi-arch Docker image + npm publish
```

> **Prerequisite:** Add `NPM_TOKEN` secret to GitHub repository settings (Settings → Secrets → Actions).

---

## Minimum Initial Seed

After deployment, run the seed to create the default admin role and permissions:

```bash
npm run seed:rbac
```

This creates:
- `admin` role with all permissions
- Default permissions for `user:*`, `role:*`, `feature:*`, `permission:*`

To create the first admin user, use the `/auth/register` endpoint (or add a seed entry for the first user in `src/migrations/seeds/run-seed.ts`).
