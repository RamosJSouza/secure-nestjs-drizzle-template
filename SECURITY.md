# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Active  |
| < 1.0   | ❌ EOL     |

## Reporting a Vulnerability

**Não reporte vulnerabilidades de segurança como issues públicas do GitHub.**

### Processo de Disclosure Responsável

1. **Email:** envie um relatório detalhado para `ramosinfo@gmail.com`
2. **Assunto:** `[SECURITY] <título curto descritivo>`
3. **Conteúdo esperado:**
   - Descrição da vulnerabilidade
   - Passos reproduzíveis (PoC mínimo)
   - Impacto estimado (confidencialidade, integridade, disponibilidade)
   - Versão afetada
   - Mitigação sugerida (opcional)

### O que esperar

| Etapa | Prazo |
|-------|-------|
| Confirmação de recebimento | 48 horas |
| Avaliação inicial de severidade | 5 dias úteis |
| Patch para crítico/high | 14 dias |
| Patch para medium/low | 30 dias |
| Divulgação pública coordenada | Acordado com o reporter |

### Reconhecimento

Reporters responsáveis serão creditados no `CHANGELOG.md` e nos release notes (com permissão).

## Escopo

### In Scope
- Autenticação e autorização (JWT, RBAC, sessions)
- Injeção de SQL, NoSQL ou comandos via inputs
- Bypasses de rate limiting ou lockout
- Exposição de PII em logs ou responses
- Vulnerabilidades de CSRF, XSS, SSRF
- Problemas no fluxo de refresh token (replay, race conditions)
- Isolamento multi-tenancy (RLS bypass)

### Out of Scope
- Ataques que requerem acesso físico ao servidor
- Ataques de força bruta sem bypass das proteções existentes
- Denial of Service volumétrico (infraestrutura, não aplicação)
- Bugs sem impacto de segurança
- Issues em dependências que já têm CVE público e fix disponível (use `npm audit fix`)

## Controles de Segurança Implementados

Consulte a tabela completa em [README.md](./README.md#security-hardening-summary) e o detalhamento em [docs/en/compliance.md](./docs/en/compliance.md).

### Resumo de controles críticos

| Controle | Implementação |
|----------|--------------|
| Senhas | Argon2id (64 MiB / 3t / 4p) |
| Tokens | JWT RS256 assimétrico, JTI revocation via Redis |
| Sessões | Rotação atômica, reuse detection, max 10/usuário |
| RBAC | DB-driven a cada request (JWT roleId nunca confiado) |
| Multi-tenancy | PostgreSQL RLS + context isolation |
| Rate limiting | 5 req/min (login), 10 req/min (refresh), 120 req/min (global) |
| Headers | Helmet + HSTS (prod) + CSP + frame-ancestors none |
| Auditoria | Append-only, PII redacted, correlation IDs |
| Credential stuffing | Contador Redis por IP; 20 falhas/hora → bloqueio 15 min |

## Configuração Segura para Produção

```bash
# Variáveis obrigatórias em produção
NODE_ENV=production
ALLOWED_ORIGINS=https://seu-dominio.com
PERMISSION_GUARD_STRICT=true   # fail-closed para RBAC

# Rotação de chaves JWT
./scripts/rotate-jwt-keys.sh

# Aplicar RLS no banco
psql -f src/database/rls/0001_enable_rls.sql
```

## Hall of Fame

*Nenhuma vulnerabilidade reportada ainda. Seja o primeiro!*
