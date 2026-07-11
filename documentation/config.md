# Configuração

> **Documentação canônica:** [docs/pt-br/configuracao.md](../docs/pt-br/configuracao.md) · [docs/en/configuration.md](../docs/en/configuration.md)

O projeto usa `@nestjs/config` e Joi para validação de variáveis de ambiente.

## Variáveis de ambiente

O arquivo `.env` deve estar na raiz do projeto. Referência completa: [`.env.example`](../.env.example).

### Aplicação
- `NODE_ENV`: `development`, `production` ou `test`. Padrão: `development`
- `PORT`: Porta do servidor. Padrão: `3000`
- `APP_NAME`: Nome da aplicação (opcional)

### Banco de dados (PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `DB_SSL`: `true` para TLS (obrigatório em produção)
- `DB_POOL_MAX`: Máximo do pool. Padrão: `20`
- `DATABASE_URL`: string opcional para Drizzle Kit (`db:generate`, `db:migrate`, `db:studio`)

### Autenticação (JWT RS256)
- `PRIVATE_KEY`, `PUBLIC_KEY`: chaves RSA PEM (obrigatórias em produção)

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

No `.env`, cole o PEM em uma linha com `\n` no lugar das quebras.

### CORS
- `ALLOWED_ORIGINS`: URLs separadas por vírgula. **Obrigatório em produção.**

### Redis e cache
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `DISABLE_REDIS`: `true` desabilita BullMQ e usa cache in-memory (padrão local: `true`)
- `RBAC_CACHE_TTL`: TTL do cache de permissões RBAC em ms. Padrão: `300000` (5 min)

### Segurança
- `PERMISSION_GUARD_STRICT`: `true` → `PermissionGuard` fail-closed quando `@RequirePermissions` ausente

### E-mail (Nodemailer / SMTP)
- `APP_URL`: URL base para links nos e-mails
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
- Dev sem SMTP → Ethereal automático (preview URL no log)

### Recuperação e verificação
- `PASSWORD_RESET_TOKEN_TTL_SECONDS` (padrão 900)
- `EMAIL_VERIFICATION_TOKEN_TTL_SECONDS` (padrão 86400)
- `PASSWORD_CHANGE_GRACE_PERIOD_HOURS` (padrão 24)
- `FORGOT_PASSWORD_MIN_RESPONSE_MS` (padrão 250)

## Validação Joi

Schema em `src/config/validation.schema.ts`:
- Falha na inicialização com todos os erros (`abortEarly: false`)
- Produção exige: `PRIVATE_KEY`, `PUBLIC_KEY`, `DB_SSL=true`, `ALLOWED_ORIGINS`

## Scripts Drizzle

```bash
npm run db:generate   # gera migration a partir do schema
npm run db:migrate    # aplica migrations
npm run db:studio     # Drizzle Studio
npm run seed:rbac     # seed RBAC + admin
```

## Uso no código

```typescript
constructor(private configService: ConfigService) {}

const port = this.configService.get<number>('port');
const cacheTtl = this.configService.get<number>('rbac.cacheTtl');
const redisHost = this.configService.get<string>('redis.host');
```

Config factory: `src/config/index.ts`.
