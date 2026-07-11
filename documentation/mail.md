# Módulo de E-mail

O sistema usa **Nodemailer** com arquitetura Ports & Adapters (`IEmailProvider` → `NodemailerAdapter` → `MailFacade`).

## Configuração

Variáveis no `.env`:

| Variável | Descrição |
|----------|-----------|
| `APP_URL` | URL base para links nos e-mails (reset, verificação) |
| `SMTP_HOST` | Host SMTP (vazio em dev → Ethereal automático) |
| `SMTP_PORT` | Porta SMTP (padrão `587`) |
| `SMTP_USER` / `SMTP_PASS` | Credenciais SMTP |
| `SMTP_FROM_EMAIL` | Remetente |
| `SMTP_FROM_NAME` | Nome do remetente (opcional) |

### Desenvolvimento

Sem `SMTP_HOST`, o adapter cria conta Ethereal automaticamente. Ao enviar e-mail, a URL de preview aparece no log do servidor.

### Produção

Configure SMTP real (SendGrid, Amazon SES, Mailgun, etc.) e defina `APP_URL` com a URL pública da aplicação.

## Uso

Injete `MailFacade` nos serviços de auth:

```typescript
await this.mailFacade.sendPasswordResetEmail(email, resetUrl);
await this.mailFacade.sendEmailVerificationEmail(email, verifyUrl);
```

## Fluxos que enviam e-mail

1. **Recuperação de senha** — `POST /auth/forgot-password` → link com token opaco (nunca JWT)
2. **Verificação de e-mail** — `POST /auth/send-verification` → link com token opaco

## Segurança

- Tokens nos links são opacos (`randomBytes(32)`); apenas o hash SHA-256 é armazenado (Redis ou memória)
- Falhas de SMTP são logadas; forgot-password não revela se o e-mail existe (sempre HTTP 202)
