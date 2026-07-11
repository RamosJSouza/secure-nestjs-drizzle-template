# Autenticação

> **Documentação canônica:** [docs/pt-br/autenticacao.md](../docs/pt-br/autenticacao.md) · [docs/en/authentication.md](../docs/en/authentication.md)

## Visão geral

O sistema usa JWT com algoritmo **RS256**. A chave privada (`PRIVATE_KEY`) assina os tokens; a chave pública (`PUBLIC_KEY`) verifica. Isso permite distribuir apenas a chave pública para serviços que validam tokens.

## Configuração de tokens

| Token         | Expiração | Uso                                        |
|---------------|-----------|--------------------------------------------|
| Access token  | 15 min    | Autenticação em requisições protegidas     |
| Refresh token | 7 dias    | Obter novo par de tokens sem novo login    |

## Payload JWT

Access token (15 min):
- `sub`: ID do usuário
- `jti`: JWT ID — UUID único por token, usado para revogação imediata

Refresh token (7 dias):
- `sub`: ID do usuário apenas

> **Nota de segurança:** E-mail e `roleId` são **intencionalmente excluídos** de todos os payloads JWT — previne vazamento de PII via decodificação client-side e elimina claims de role desatualizadas. O `JwtStrategy` recarrega o usuário do banco a cada requisição; a role nunca é inferida do token. O campo `password` é sempre removido do `req.user`.

## Hash de senhas

As senhas são protegidas com **Argon2id** (64 MiB, 3 iterações, 4 threads). Hashes bcrypt legados são verificados e reprocessados com Argon2id de forma transparente no próximo login.

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | Não | Login (5 req/min por IP) |
| POST | `/auth/refresh` | Não | Rotação de refresh token (10 req/min) |
| POST | `/auth/logout` | Bearer | Revoga sessão + JTI imediatamente |
| POST | `/auth/register` | Bearer + `users:create` | Cria usuário (admin) |
| POST | `/auth/change-password` | Bearer | Exige `currentPassword`; revoga todas as sessões |

## Fluxos resumidos

### Login
1. Verificação de IP na blocklist de credential stuffing (20 falhas/h → HTTP 429).
2. Validação de credenciais com mensagem uniforme `"Invalid credentials"`.
3. Motor de Risco pontua o login; score `critical` (≥80) bloqueia e revoga sessões.
4. Limite de 10 sessões por usuário; JTI único embutido no access token.

### Refresh
Rotação atômica; reutilização de token revogado → revoga família de sessões + blocklist de JTIs.

### Logout
Revoga sessão no banco e adiciona JTI ao Redis blocklist imediatamente.

### Alteração de senha
Exige senha atual; revoga todas as sessões e JTIs ativos.

## Proteções adicionais

- Lockout por conta: 5 falhas → bloqueio de 15 minutos
- Credential stuffing por IP: 20 falhas/hora → bloqueio de IP por 15 minutos
- Soft-delete: usuários com `deletedAt` não autenticam
- Rate limiting em duas camadas (global + por endpoint)

Para diagramas de sequência, tabelas de rate limit e detalhes de revogação JTI, consulte a [documentação canônica](../docs/pt-br/autenticacao.md).
