# Observability

## Structured Logging

The application uses **Pino** for high-performance structured logging. Logs include:
- Request/response lifecycle
- Correlation ID for request tracing
- Error stack traces

## Correlation ID

Each request receives an `X-Correlation-Id` (generated or passed in header). It is:
- Propagated to all logs for the request
- Stored in audit log entries
- Returned in response headers for client-side tracing

Use the same correlation ID when calling downstream services or debugging issues.

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health/liveness` | Returns `{ status: 'ok' }`. Used by orchestration to verify process is alive. |
| `GET /health/readiness` | Checks database and Redis. Fails if dependencies are unavailable. |

Docker and Kubernetes should use readiness for routing traffic and liveness for restart decisions.

## Audit Log

- Append-only; no updates or deletes.
- Each audited mutation logs: action, entityType, entityId, actorUserId, correlationId, metadata, ip, userAgent.
- Security events are emitted via `SecurityEventService` (typed facade — no raw strings).

| Action | Trigger |
|--------|---------|
| `user.create` | Register |
| `user.change_password` | Change password endpoint |
| `role.*` | RBAC mutations |
| `rbac.role.permissions_assigned` | Permission diff (added/removed) logged with before/after |
| `auth.account.locked` | 5 consecutive login failures |
| `auth.password.changed` | Password changed, all sessions revoked |
| `auth.refresh_token_reuse_detected` | Stolen token replay attempt |
| `security.risk.login_blocked` | Risk score ≥ 80 (critical) — all sessions revoked |
| `security.risk.elevated_login` | Risk score medium (30–59) or high (60–79) |
| `security.session.limit_eviction` | Session cap exceeded (max 10), oldest evicted |
| `security.ip.blocked_stuffing` | Per-IP credential stuffing threshold hit |
| `webhook.delivered` | Webhook delivery succeeded (HTTP 2xx) |
| `webhook.failed` | Webhook delivery failed after all retries |

See [Audit Module](../../src/modules/audit/README.md) for integration details.
