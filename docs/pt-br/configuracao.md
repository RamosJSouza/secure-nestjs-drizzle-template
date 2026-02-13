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
- `DB_LOGGING`: `true` para logs SQL (opcional)
- `DB_SYNCHRONIZE`: `true` para auto-sync (apenas dev)
- `DB_POOL_MAX`: Máximo do pool de conexões. Padrão: `20`

Em produção, `synchronize` é sempre `false`; use migrations.

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
- `REDIS_HOST`, `REDIS_PORT` (padrão: 6379)

### E-mail (Resend)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` (opcional)

## Validação

O schema Joi em `src/config/validation.schema.ts`:
- Falha cedo na inicialização com todos os erros de validação
- Exige `PRIVATE_KEY` e `PUBLIC_KEY` quando `NODE_ENV=production`
- Exige `DB_SSL=true` em produção
- Exige `ALLOWED_ORIGINS` em produção (formato de URLs)
