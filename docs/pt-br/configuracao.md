# Configuração

O projeto utiliza `@nestjs/config` e Joi para validação de variáveis de ambiente.

## Variáveis de Ambiente

O arquivo `.env` deve estar na raiz do projeto.

### Aplicação
- `NODE_ENV`: `development`, `production` ou `test`. Padrão: `development`
- `PORT`: Porta do servidor. Padrão: `3000`
- `APP_NAME`: Nome da aplicação (opcional)

### Banco de Dados (PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `DB_SSL`: `true` para TLS (obrigatório em produção)
- `DB_POOL_MAX`: Máximo do pool de conexões. Padrão: `20`
- `DATABASE_URL`: string de conexão opcional para ferramentas Drizzle (`db:generate`, `db:migrate`, `db:studio`)

Em produção, o schema sync fica desabilitado; use apenas migrations do Drizzle.

### Autenticação (JWT RS256)
- `PRIVATE_KEY`: Chave privada RSA em formato PEM (assina tokens)
- `PUBLIC_KEY`: Chave pública RSA em formato PEM (verifica tokens)

Gerar chaves:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

No `.env`, cole o conteúdo PEM em uma linha, substituindo quebras por `\n`. Ambas obrigatórias em produção.

### CORS
- `ALLOWED_ORIGINS`: URLs separadas por vírgula (ex: `https://admin.example.com`). **Obrigatório em produção.**

### Redis
- `REDIS_HOST`: Padrão `localhost`
- `REDIS_PORT`: Padrão `6379`
- `REDIS_PASSWORD`: Opcional
- `DISABLE_REDIS`: Defina como `true` para desabilitar a inicialização do BullMQ (o CRUD de webhooks permanece disponível; a fila de entrega assíncrona é desativada). Também faz o `AppCacheModule` usar cache in-memory. Padrão no `.env.example`: `true` (dev local sem Redis).

### Cache RBAC
- `RBAC_CACHE_TTL`: TTL do cache de permissões em milissegundos. Padrão: `300000` (5 minutos). Usado por `RbacService` e `AppCacheModule`.

### Guards de Segurança
- `PERMISSION_GUARD_STRICT`: Defina como `true` para que o `PermissionGuard` falhe fechado (HTTP 403) quando `@RequirePermissions` estiver ausente. Padrão: `false` (fail-open com log WARN — permite rotas protegidas por outros meios).

### URL da aplicação
- `APP_URL`: URL base para links em e-mails transacionais (reset de senha, verificação). Padrão: `http://localhost:3000`

### E-mail (Nodemailer / SMTP)
- `SMTP_HOST`, `SMTP_PORT` (padrão `587`), `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` (nome do remetente, opcional)
- **Desenvolvimento:** sem `SMTP_HOST`, o `NodemailerAdapter` cria conta Ethereal automaticamente; URL de preview no log.
- **Produção:** configure SMTP real; links usam `APP_URL`.

### Recuperação de conta e verificação
- `PASSWORD_RESET_TOKEN_TTL_SECONDS`: TTL do token de reset. Padrão: `900` (15 min)
- `EMAIL_VERIFICATION_TOKEN_TTL_SECONDS`: TTL do token de verificação. Padrão: `86400` (24 h)
- `PASSWORD_CHANGE_GRACE_PERIOD_HOURS`: Horas após troca de senha em que rotas sensíveis ficam bloqueadas. Padrão: `24`
- `FORGOT_PASSWORD_MIN_RESPONSE_MS`: Tempo mínimo de resposta do forgot-password (mitigação de timing). Padrão: `250`

## Validação

O schema Joi em `src/config/validation.schema.ts`:
- Falha cedo na inicialização com todos os erros de validação
- Exige `PRIVATE_KEY` e `PUBLIC_KEY` quando `NODE_ENV=production`
- Exige `DB_SSL=true` em produção
- Exige `ALLOWED_ORIGINS` em produção (formato de URLs)

## Scripts Drizzle

- `npm run db:generate` — gera arquivos de migration a partir do schema
- `npm run db:migrate` — aplica migrations
- `npm run db:studio` — abre o Drizzle Studio
