# Configuração

O projeto usa `@nestjs/config` e Joi para validação de variáveis de ambiente.

## Variáveis de ambiente

O arquivo `.env` deve estar na raiz do projeto.

### Aplicação
- `NODE_ENV`: Ambiente (`development`, `production`, `test`). Padrão: `development`.
- `PORT`: Porta do servidor. Padrão: `3000`.
- `APP_NAME`: Nome da aplicação (opcional).

### Banco de dados (PostgreSQL)
- `DB_HOST`: Host do banco.
- `DB_PORT`: Porta. Padrão: `5432`.
- `DB_USERNAME`: Usuário.
- `DB_PASSWORD`: Senha.
- `DB_DATABASE`: Nome do banco.
- `DB_SSL`: `true` para TLS (obrigatório em produção).
- `DB_LOGGING`: `true` para logs SQL (opcional).
- `DB_SYNCHRONIZE`: `true` para auto-sync (apenas dev).
- `DB_POOL_MAX`: Máximo de conexões no pool. Padrão: `20`.

> Em produção, `synchronize` é sempre `false`; use migrations.

### Autenticação (JWT RS256)
- `PRIVATE_KEY`: Chave privada RSA em formato PEM (assinatura de tokens).
- `PUBLIC_KEY`: Chave pública RSA em formato PEM (verificação de tokens).

Gerar chaves:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

No `.env`, colar o conteúdo PEM em uma única linha, substituindo quebras de linha por `\n`. Em produção, ambas são obrigatórias.

### CORS
- `ALLOWED_ORIGINS`: URLs permitidas, separadas por vírgula (ex: `https://admin.example.com`). **Obrigatório em produção.**

### Redis
- `REDIS_HOST`: Host do Redis.
- `REDIS_PORT`: Porta. Padrão: `6379`.

### E-mail (Resend)
- `RESEND_API_KEY`: Chave de API Resend.
- `RESEND_FROM_EMAIL`: E-mail remetente autorizado.
- `RESEND_FROM_NAME`: Nome do remetente (opcional).

## Validação

O schema Joi em `src/config/validation.schema.ts`:
- Valida e falha cedo (`abortEarly: false` para retornar todos os erros).
- Exige `PRIVATE_KEY` e `PUBLIC_KEY` preenchidos quando `NODE_ENV=production`.
- Exige `DB_SSL=true` em produção.
- Exige `ALLOWED_ORIGINS` em produção (formato de URLs).

## Uso no código

```typescript
constructor(private configService: ConfigService) {}

const port = this.configService.get<number>('port');
const dbConfig = this.configService.get('database');
```
