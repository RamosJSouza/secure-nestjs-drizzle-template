# Observabilidade

## Logging Estruturado

A aplicação usa **Pino** para logging estruturado de alta performance. Os logs incluem:
- Ciclo de vida de requisição/resposta
- Correlation ID para rastreamento
- Stack traces de erros

## Correlation ID

Cada requisição recebe um `X-Correlation-Id` (gerado ou passado no header). Ele é:
- Propagado para todos os logs da requisição
- Armazenado nas entradas do audit log
- Retornado nos headers da resposta para rastreamento pelo cliente

Use o mesmo correlation ID ao chamar serviços downstream ou depurar problemas.

## Health Checks

| Endpoint | Finalidade |
|----------|------------|
| `GET /health/liveness` | Retorna `{ status: 'ok' }`. Usado pela orquestração para verificar se o processo está ativo. |
| `GET /health/readiness` | Verifica database e Redis. Falha se dependências indisponíveis. |

Docker e Kubernetes devem usar readiness para rotear tráfego e liveness para decisões de reinício.

## Audit Log

- Append-only; sem updates ou deletes.
- Cada mutação auditada registra: action, entityType, entityId, actorUserId, correlationId, metadata, ip, userAgent.
- Eventos de segurança são emitidos via `SecurityEventService` (facade tipada — sem strings brutas).

| Action | Gatilho |
|--------|---------|
| `user.create` | Registro |
| `user.change_password` | Endpoint de troca de senha |
| `role.*` | Mutações RBAC |
| `rbac.role.permissions_assigned` | Diff de permissão (adicionadas/removidas) com antes/depois |
| `auth.account.locked` | 5 tentativas de login consecutivas falhas |
| `auth.password.changed` | Senha alterada, todas as sessões revogadas |
| `auth.refresh_token_reuse_detected` | Replay de token roubado |
| `security.risk.login_blocked` | Score de risco ≥ 80 (crítico) — todas as sessões revogadas |
| `security.risk.elevated_login` | Score de risco médio (30–59) ou alto (60–79) |
| `security.session.limit_eviction` | Limite de sessões excedido (máx. 10), mais antiga removida |
| `security.ip.blocked_stuffing` | Limiar de credential stuffing por IP atingido |
| `webhook.delivered` | Entrega de webhook bem-sucedida (HTTP 2xx) |
| `webhook.failed` | Entrega de webhook falhou após todas as tentativas |

Consulte [Audit Module](../../src/modules/audit/README.md) para detalhes de integração.
