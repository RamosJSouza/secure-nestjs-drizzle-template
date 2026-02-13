# Módulo de E-mail

O sistema usa `nest-resend` para integração com [Resend](https://resend.com/).

## Configuração

Variáveis no `.env`:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME` (opcional)

## Uso

O `MailService` centraliza o envio de e-mails transacionais.

### Métodos disponíveis

1. **sendWelcomeEmail(email, name)**
   - Envia e-mail de boas-vindas para novos usuários.

2. **sendPasswordReset(email, token)**
   - Envia link de recuperação de senha com o token JWT gerado.

## Logs e erros

O serviço registra erros em caso de falha (API Key inválida, limite atingido). A exceção é propagada para o chamador tratar.
