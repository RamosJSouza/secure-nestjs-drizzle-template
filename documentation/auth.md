# Autenticação

## Visão geral

O sistema usa JWT com algoritmo **RS256**. A chave privada (`PRIVATE_KEY`) assina os tokens; a chave pública (`PUBLIC_KEY`) verifica. Isso permite distribuir apenas a chave pública para serviços que validam tokens.

## Configuração de tokens

| Token         | Expiração | Uso                                        |
|---------------|-----------|--------------------------------------------|
| Access token  | 15 min    | Autenticação em requisições protegidas     |
| Refresh token | 7 dias    | Obter novo par de tokens sem novo login    |

## Payload JWT

- `sub`: ID do usuário.
- `email`: E-mail do usuário.
- `roleId`: ID da Role atribuída ao usuário.

## Fluxos

### Login
1. Cliente envia email e senha em `POST /auth/login`.
2. Servidor valida credenciais, verifica conta ativa e bloqueio.
3. Em sucesso: retorna `access_token` e `refresh_token`.
4. Refresh token é armazenado em sessão (hash SHA-256) com IP e User-Agent.

### Refresh
1. Cliente envia `refresh_token` em `POST /auth/refresh`.
2. Servidor valida token (RS256) e sessão.
3. Se a sessão foi revogada (ex.: reutilização detectada), todas as sessões do usuário são revogadas e retorna erro.
4. Em sucesso: nova sessão é criada, sessão antiga é revogada; retorna novo par de tokens (rotação).

### Rotação e detecção de reutilização
- Cada refresh invalida o token anterior (rotação).
- Se um refresh token já revogado for usado (reutilização), o sistema:
  - revoga todas as sessões do usuário;
  - registra evento `auth.refresh_token_reuse_detected` no audit log.

### Mudança de senha
- `POST /auth/change-password` exige autenticação (Bearer).
- Ao alterar a senha, **todas as sessões ativas (não revogadas)** do usuário são revogadas.
- Sessões já revogadas preservam o timestamp original de `revoked_at` para manter a auditoria íntegra.
- O usuário precisa fazer login novamente em cada dispositivo.

## Bloqueio de conta (lockout)

- Após **5 tentativas de login falhas**, a conta é bloqueada por **15 minutos**.
- O evento `auth.account.locked` é registrado no audit log.
- Usuários desativados ou bloqueados recebem `401 Unauthorized`.

## Diagrama de sequência (login/register)

```mermaid
sequenceDiagram
  participant C as Client
  participant AC as AuthController
  participant AS as AuthService
  participant US as UsersService

  C->>+AC: Login ou register
  AC->>+AS: login() ou register()
  AS->>+US: Busca ou cria usuário
  US-->>-AS: Usuário
  AS-->>-AC: Tokens ou confirmação
  AC-->>-C: Resposta
```

## Endpoints

| Método | Rota                | Auth       | Descrição                          |
|--------|----------------------|------------|------------------------------------|
| POST   | /auth/login          | Não        | Login                              |
| POST   | /auth/refresh        | Não        | Trocar refresh por novos tokens    |
| POST   | /auth/register       | Sim + perm | Criar usuário (users:create)       |
| POST   | /auth/change-password| Sim        | Alterar senha do usuário autenticado |
