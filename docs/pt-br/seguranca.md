# Segurança

## Modelo de Autenticação

- **JWT RS256:** Assinatura assimétrica. A chave privada nunca sai do servidor; a chave pública pode ser distribuída a validadores.
- **Tokens de acesso de curta duração:** 15 minutos limitam a exposição em caso de vazamento.
- **Revogação por JTI (JWT ID):** Cada token de acesso carrega um UUID único `jti`. No logout ou na troca de senha, o JTI é adicionado a uma blocklist no Redis. O `JwtStrategy` realiza uma busca O(1) no Redis antes de aceitar qualquer token — a revogação ocorre *imediatamente*, mesmo dentro do TTL de 15 minutos. Falha aberta se o Redis estiver indisponível (disponibilidade > revogação estrita durante falhas).
- **Rotação de refresh token:** Cada refresh invalida o token anterior e emite um novo.
- **Detecção de reutilização:** Se um refresh token revogado for reutilizado, **todas** as sessões do usuário são revogadas imediatamente e todos os JTIs de tokens de acesso ativos são adicionados à blocklist.
- **Alteração de senha:** Revoga todas as sessões e todos os JTIs associados em todos os dispositivos imediatamente.
- **Logout:** `POST /auth/logout` revoga a sessão específica e invalida seu JTI de acesso imediatamente.
- **Limite de sessões:** Máximo de 10 sessões ativas por usuário. A sessão mais antiga é removida (e seu JTI revogado) quando o limite é excedido — previne flooding da tabela de sessões.
- **Fingerprint de dispositivo:** Hash SHA-256 de `User-Agent + IP` armazenado por sessão para fins forenses.

## Hash de Senhas

As senhas são protegidas com **Argon2id** — vencedor do Password Hashing Competition, recomendado pela OWASP.

| Parâmetro | Valor | Motivo |
|-----------|-------|--------|
| Algoritmo | Argon2id | Resistente a ataques de canal lateral e força bruta com GPU/ASIC |
| Custo de memória | 64 MiB | Eleva o custo por tentativa do atacante |
| Custo de tempo | 3 iterações | ~100ms por hash em hardware moderno |
| Paralelismo | 4 threads | Satura os cores do atacante |
| Tamanho máximo | 72 chars | Aplicado por DTO para prevenir ataques de padding em famílias bcrypt |

### Migração Transparente do bcrypt

Hashes bcrypt existentes no banco continuam funcionando. No primeiro login bem-sucedido, o hash é **reprocessado silenciosamente com Argon2id**, sem nenhuma mudança visível ao usuário nem redefinição forçada de senha. Novos hashes são sempre Argon2id.

## Autorização

- Todos os endpoints de mutação exigem `JwtAuthGuard` (token Bearer válido).
- RBAC aplicado via `PermissionGuard` e `@RequirePermissions`.
- A verificação de permissão é baseada em banco (`RolePermission`), não hardcoded.
- Parâmetros UUID de rota são validados com `ParseUUIDPipe` — valores inválidos retornam `400` antes de atingir o banco.
- `PermissionGuard` aplicado sem `@RequirePermissions` emite log `WARN` (rota desprotegida pelo RBAC) mas permite a requisição — comportamento fail-open intencional para rotas protegidas por outros meios.
- Respostas `403 Forbidden` nunca incluem o nome da permissão exigida — impede que atacantes mapeiem o sistema de permissões via respostas de erro.

## Motor de Risco (Risk Engine)

Cada login bem-sucedido é pontuado pelo `RiskEngineService` usando cinco sinais consultados em paralelo:

| Sinal | Contribuição de pontuação |
|-------|--------------------------|
| Dispositivo novo (fingerprint nunca visto) | +20 |
| IP novo em dispositivo conhecido | +10 |
| Taxa de falhas por IP 5–9 na última hora | +10 |
| Taxa de falhas por IP 10–14 na última hora | +20 |
| Taxa de falhas por IP ≥ 15 na última hora | +30 |
| Conta bloqueada nos últimos 60 minutos | +20 |
| Evento recente de reutilização de token | +50 |

Níveis de risco e ações:

| Pontuação | Nível | Ação |
|-----------|-------|------|
| 0–29 | `low` | Login prossegue normalmente |
| 30–59 | `medium` | Login prossegue; evento de auditoria `security.risk.elevated_login` registrado |
| 60–79 | `high` | Login prossegue; evento de auditoria `security.risk.elevated_login` registrado |
| 80+ | `critical` | **Login bloqueado (HTTP 403)**; todas as sessões revogadas; todos os JTIs adicionados à blocklist do Redis; evento `security.risk.login_blocked` registrado |

Todos os detectores de sinal falham **abertos** (retornam 0 em caso de erro) — uma falha no Redis ou banco não bloqueia logins.

## Proteção na Alteração de Senha

`POST /auth/change-password` exige que o chamador forneça a **senha atual** junto com a nova senha. A senha atual é verificada antes de qualquer alteração. Isso previne tomada de conta via token de acesso roubado — mesmo com um Bearer token válido, o atacante não consegue trocar a senha sem conhecer a senha atual.

## Requisitos de Senha

Todos os DTOs de senha (register, change-password, create-user) exigem:

- Mínimo de **8 caracteres**
- Máximo de **72 caracteres** (previne ataques de truncamento de hash)
- Pelo menos uma letra **maiúscula**
- Pelo menos uma letra **minúscula**
- Pelo menos um **dígito**

## Rate Limiting — Duas Camadas

### Camada 1: Nível de IP (`express-rate-limit`)

| Limite | Janela | Escopo |
|--------|--------|--------|
| 300 requisições | 15 minutos | Todas as rotas por IP |
| Isento | — | `/health/liveness`, `/health/readiness` |

Fornece proteção ampla contra DDoS e abuso. Requer configuração correta de `trust proxy` (ver abaixo).

### Camada 2: Por Endpoint (`@nestjs/throttler`)

| Limiter nomeado | Rota | Limite | Janela |
|-----------------|------|--------|--------|
| `auth` | `POST /auth/login` | 5 requisições | 1 minuto por IP |
| `auth` | `POST /auth/refresh` | 10 requisições | 1 minuto por IP |
| `default` | Todas as demais rotas | 120 requisições | 1 minuto por IP |

O limiter `auth` é aplicado explicitamente via `@Throttle({ auth: ... })` nos métodos do controller. Endpoints administrativos (register) ignoram o limiter `auth` pois já estão protegidos por `JwtAuthGuard + PermissionGuard`.

## Hardening HTTP

| Camada | Implementação |
|--------|---------------|
| Headers de segurança | Helmet (CSP, HSTS, X-Frame-Options, etc.) |
| CSP | `default-src 'self'`; `style-src` relaxado para Swagger UI em dev |
| `crossOriginEmbedderPolicy` | Ativo apenas em produção |
| Rate limiting | Duas camadas (ver acima) |
| CORS | Restrito a `ALLOWED_ORIGINS` (obrigatório e validado em produção) |
| Validação de entrada | `ValidationPipe` com `whitelist: true`, `forbidNonWhitelisted: true` |
| Validação de config | Schema Joi — falha rápida na inicialização |
| Swagger | **Desabilitado em produção** (`NODE_ENV=production`) |

## Trust Proxy

`app.set('trust proxy', 1)` está configurado para que `req.ip` reflita o IP real do cliente quando atrás de um proxy reverso (Nginx, AWS ALB, Cloudflare). Sem essa configuração, todos os clientes compartilham o IP do balanceador — inutilizando o rate limiting e tornando os logs de auditoria imprecisos.

Se seu deployment tiver múltiplos saltos de proxy, ajuste o nível de confiança:
```bash
# Confia no primeiro hop apenas (maioria dos deployments)
trust proxy = 1

# Confia em uma sub-rede específica (ex.: ingress do Kubernetes)
trust proxy = 10.0.0.0/8
```

## CORS

`ALLOWED_ORIGINS` é parseado e sanitizado:
- Em **desenvolvimento**: padrão `true` (permite tudo) se não configurado.
- Em **produção**: deve ser explicitamente definido com URLs separadas por vírgula (validado pelo Joi). Padrão `false` se a lista ficar vazia após o parse.

## Proteção de Conta

- **Bloqueio:** 5 logins falhos → bloqueio de 15 minutos.
- **Detecção de credential stuffing:** Contador de falhas por IP no Redis (`sec:fail:ip:{ip}`). Após 20 falhas em 1 hora do mesmo IP, todas as tentativas de login desse IP são bloqueadas por 15 minutos (HTTP 429). O contador é incrementado mesmo para contas inexistentes, prevenindo probing.
- **Auditoria:** `auth.account.locked`, `auth.refresh_token_reuse_detected`, `auth.password.changed` e eventos de bloqueio de IP são todos registrados.
- **Desativação:** Usuários inativos (`isActive = false`) recebem `401` em qualquer requisição autenticada.
- **Soft-delete:** Usuários excluídos (`deletedAt IS NOT NULL`) são excluídos de todas as queries — não conseguem fazer login mesmo que `isActive` não tenha sido atualizado separadamente. O método `remove()` define `deletedAt` e `isActive = false` de forma atômica.
- **Senha removida do `req.user`:** O `JwtStrategy.validate()` retorna o objeto do usuário sem o campo `password`. O hash nunca está presente no contexto da requisição.
- **Prevenção de enumeração de usuários:** O login retorna a mensagem uniforme `"Invalid credentials"` para todos os casos de falha (usuário inexistente, inativo, bloqueado, senha errada).
- **Role sempre recarregada do banco:** O `JwtStrategy` recarrega o usuário do banco em cada requisição — o `roleId` no claim JWT nunca é confiado. Alterações de role têm efeito imediato sem necessidade de novo login.

## Formato de Chave de Permissão

O campo `action` de permissões é validado com `@Matches(/^[a-z0-9_-]+$/)` para garantir o formato slug. Isso previne chaves de permissão malformadas como `create OR 1=1`.

## Trilha de Auditoria do RBAC

Toda chamada a `assignPermissions` é auditada com diff antes/depois:
- `added`: IDs de permissão recém-concedidas
- `removed`: IDs de permissão revogadas
- Registrado como `rbac.role.permissions_assigned` no log de auditoria, incluindo o ID do ator.

## Logging Estruturado e Proteção de PII

A opção `redact` do Pino remove campos sensíveis antes de gravar as entradas de log:

| Campo redacted | Substituição |
|----------------|-------------|
| `req.headers.authorization` | `[REDACTED]` |
| `req.headers.cookie` | `[REDACTED]` |
| `req.body.password` | `[REDACTED]` |
| `req.body.newPassword` | `[REDACTED]` |
| `req.body.confirmPassword` | `[REDACTED]` |
| `req.body.refresh_token` | `[REDACTED]` |

## Prevenção de Injeção de Correlation ID

O header `X-Correlation-Id` é validado no formato UUID v4 antes de ser usado como ID de correlação da requisição. Valores inválidos ou injetados são descartados silenciosamente e substituídos por um UUID gerado pelo servidor. Isso previne injeção de log via header.

## Requisitos de Produção

- `PRIVATE_KEY` e `PUBLIC_KEY` devem ser chaves RSA não vazias.
- `DB_SSL=true` para conexões criptografadas com o banco.
- `ALLOWED_ORIGINS` deve listar as URLs permitidas do frontend.
- `NODE_ENV=production` desabilita o Swagger UI.
- Credenciais do seed devem ser alteradas após o primeiro deploy.
- Faça o deploy atrás de um proxy reverso e configure o `trust proxy` adequadamente.
