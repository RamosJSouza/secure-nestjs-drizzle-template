# Guia de Deploy

## Opção A — Railway (Recomendado para Demo)

O Railway detecta o `Dockerfile` automaticamente e fornece PostgreSQL e Redis gerenciados.

### 1. Criar serviços no Railway

```bash
# Instalar Railway CLI
npm install -g @railway/cli
railway login

# Criar projeto e serviços
railway init          # cria novo projeto Railway
railway add postgres  # PostgreSQL gerenciado (Railway fornece DATABASE_URL)
railway add redis     # Redis gerenciado (Railway fornece REDIS_URL)
```

### 2. Variáveis de ambiente obrigatórias

Defina em **Railway → Project → Variables**:

```env
NODE_ENV=production
PORT=3000

# PostgreSQL — Railway injeta DATABASE_URL automaticamente
# Ou defina individualmente:
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_DATABASE=${{Postgres.PGDATABASE}}
DB_SSL=true

# Redis — Railway injeta REDIS_URL
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}
REDIS_PASSWORD=${{Redis.REDISPASSWORD}}

# Chaves JWT RS256 (em linha única com \n)
# Gere com: bash scripts/rotate-jwt-keys.sh
PRIVATE_KEY=<chave RSA privada em linha única com \n>
PUBLIC_KEY=<chave RSA pública em linha única com \n>

# CORS — domínio do seu frontend
ALLOWED_ORIGINS=https://seu-frontend.railway.app

# Opcional: guard de permissão no modo estrito
PERMISSION_GUARD_STRICT=true
```

> **Dica:** Use `scripts/rotate-jwt-keys.sh` para gerar chaves no formato de linha única pronto para variáveis de ambiente.

### 3. Gerar chaves RSA para produção

```bash
bash scripts/rotate-jwt-keys.sh
# Gera PRIVATE_KEY e PUBLIC_KEY em formato de linha única
# Copie a saída diretamente para as Variables do Railway
```

### 4. Deploy

```bash
railway up
# Railway faz build do Dockerfile, executa migrations via docker-entrypoint.sh e inicia a aplicação
```

### 5. Executar seed inicial

```bash
railway run npm run seed:rbac
```

### 6. Verificar health endpoints

```bash
curl https://seu-app.railway.app/health/liveness
# → { "status": "ok" }

curl https://seu-app.railway.app/health/readiness
# → { "status": "ok", "info": { "database": {...}, "redis": {...} } }
```

---

## Opção B — Render

### 1. Criar Web Service

- Acesse [render.com](https://render.com) → New → Web Service
- Conecte o repositório GitHub `RamosJSouza/secure-nestjs-drizzle-template`
- **Environment:** Docker
- **Dockerfile path:** `./Dockerfile`
- **Health check path:** `/health/readiness`

### 2. Adicionar PostgreSQL e Redis Gerenciados

- Dashboard → New → PostgreSQL (Render fornece `DATABASE_URL`)
- Dashboard → New → Redis (Render fornece `REDIS_URL`)

### 3. Variáveis de ambiente

Iguais ao Railway acima. O Render injeta `DATABASE_URL` e `REDIS_URL` automaticamente quando os serviços são vinculados.

---

## Opção C — Docker Compose (Self-hosted / VPS)

```bash
# Clonar o repositório
git clone https://github.com/RamosJSouza/secure-nestjs-drizzle-template.git
cd secure-nestjs-drizzle-template

# Configurar ambiente
cp .env.example .env
# Editar .env com seus valores

# Gerar chaves RSA
bash scripts/rotate-jwt-keys.sh >> .env

# Subir todos os serviços
docker compose up -d

# Executar migrations e seed
docker compose exec app npm run db:migrate
docker compose exec app npm run seed:rbac
```

---

## Publicação no npm

Este pacote é publicado como `secure-nestjs-drizzle-template` no registro do npm.

### Publicação manual

```bash
# 1. Build do projeto
npm run build

# 2. Login no npm
npm login

# 3. Publicar (acesso público, configurado em publishConfig)
npm publish
```

### Publicação automatizada via GitHub Actions

O workflow de CD (`.github/workflows/cd.yml`) publica automaticamente em tags `v*.*.*`:

```bash
# Criar e fazer push de uma tag de release
git tag v1.0.1
git push origin v1.0.1
# → dispara cd.yml: build da imagem Docker multi-arch + npm publish
```

> **Pré-requisito:** Adicione o secret `NPM_TOKEN` nas configurações do repositório GitHub (Settings → Secrets → Actions).

---

## Seed Mínimo Inicial

Após o deploy, execute o seed para criar a role admin padrão e as permissões:

```bash
npm run seed:rbac
```

Isso cria:
- Role `admin` com todas as permissões
- Permissões padrão para `user:*`, `role:*`, `feature:*`, `permission:*`

Para criar o primeiro usuário admin, use o endpoint `/auth/register` (ou adicione uma entrada de seed no arquivo `src/migrations/seeds/run-seed.ts`).
