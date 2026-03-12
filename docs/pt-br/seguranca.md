# Segurança

## Modelo de Autenticação

- **JWT RS256:** Assinatura assimétrica. A chave privada nunca sai do servidor; a chave pública pode ser distribuída a validadores.
- **Tokens de acesso de curta duração:** 15 minutos limitam a exposição em caso de vazamento.
- **Rotação de refresh token:** Cada refresh invalida o token anterior e emite um novo.
- **Detecção de reutilização:** Se um refresh token revogado for reutilizado, **todas** as sessões do usuário são revogadas imediatamente.
- **Alteração de senha:** Revoga todas as sessões ativas em todos os dispositivos imediatamente.
- **Logout:** `POST /auth/logout` revoga a sessão específica associada ao refresh token fornecido.

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
- **Auditoria:** `auth.account.locked` e `auth.refresh_token_reuse_detected` registrados.
- **Desativação:** Usuários inativos (`isActive = false`) recebem `401` em qualquer requisição autenticada.
- **Soft-delete:** Usuários excluídos (`deletedAt IS NOT NULL`) são excluídos de todas as queries — não conseguem fazer login mesmo que `isActive` não tenha sido atualizado separadamente. O método `remove()` define `deletedAt` e `isActive = false` de forma atômica.
- **Senha removida do `req.user`:** O `JwtStrategy.validate()` retorna o objeto do usuário sem o campo `password`. O hash nunca está presente no contexto da requisição.
- **Prevenção de enumeração de usuários:** O login retorna a mensagem uniforme `"Invalid credentials"` para todos os casos de falha (usuário inexistente, inativo, bloqueado, senha errada).

## Formato de Chave de Permissão

O campo `action` de permissões é validado com `@Matches(/^[a-z0-9_-]+$/)` para garantir o formato slug. Isso previne chaves de permissão malformadas como `create OR 1=1`.

## Requisitos de Produção

- `PRIVATE_KEY` e `PUBLIC_KEY` devem ser chaves RSA não vazias.
- `DB_SSL=true` para conexões criptografadas com o banco.
- `ALLOWED_ORIGINS` deve listar as URLs permitidas do frontend.
- `NODE_ENV=production` desabilita o Swagger UI.
- Credenciais do seed devem ser alteradas após o primeiro deploy.
- Faça o deploy atrás de um proxy reverso e configure o `trust proxy` adequadamente.
