# Arquitetura

## Visão Geral

O Prime Nest é um backend NestJS pronto para produção, com estrutura modular voltada a escalabilidade e manutenção. O sistema é **single-tenant**, com entidade `Organization` preparada para evolução futura para multi-tenancy.

## Módulos

| Módulo | Finalidade |
|--------|------------|
| AuthModule | Login, refresh, logout, registro, alteração de senha |
| UsersModule | Gestão de usuários (criação via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| OrganizationsModule | Entidade Organization (placeholder) |
| AuditModule | Log de auditoria append-only (`@Global`) |
| HealthModule | Probes de liveness e readiness |
| GracefulShutdownModule | Encerramento controlado |
| LoggerModule | Pino, Correlation ID e redaction de PII (`@Global`) |
| SecurityModule | Revogação de JTI, detecção de credential stuffing e Motor de Risco (`@Global`) |
| ThrottlerModule | Rate limiting por endpoint (`@nestjs/throttler`) |

## Fluxo de Dados

```
User → Role → RolePermission → Permission → Feature
```

O controle de acesso é aplicado nas rotas via `JwtAuthGuard` e `PermissionGuard` com `@RequirePermissions('feature:action')`.

## Estrutura de Diretórios

```
src/
├── auth/              # Fluxos de autenticação
├── common/            # Guards, decorators
├── config/            # Validação de ambiente (Joi)
├── logger/            # Pino, middleware de correlation ID (redaction de PII)
├── database/          # Módulo de banco e schema Drizzle
├── migrations/        # Scripts de seed
├── modules/
│   ├── audit/        # Log de auditoria (@Global)
│   ├── health/       # Health checks
│   ├── organizations/ # Placeholder Organization
│   └── rbac/         # Entidades e serviços RBAC
├── security/          # Módulo de segurança @Global
│   ├── token-revocation/   # Blocklist Redis de JTI
│   ├── detection/          # Detecção de credential stuffing
│   └── risk-engine/        # Pontuação de risco no login (5 sinais, 4 níveis)
├── users/            # UsersService
└── main.ts
```

## Decisões de Design

- **Sem schema sync em produção** — Apenas migrations do Drizzle.
- **Validação fail-fast** — Schema Joi valida na inicialização; produção exige variáveis obrigatórias.
- **Auditoria append-only** — Sem updates ou deletes em registros de auditoria.
- **Swagger desabilitado em produção** — `NODE_ENV=production` impede o registro de `/api/docs`. Disponível apenas em desenvolvimento e teste.
- **Rate limiting em duas camadas** — `express-rate-limit` para proteção ampla por IP; `@nestjs/throttler` para throttling fino por endpoint (especialmente rotas críticas de autenticação).
- **Hash de senhas com Argon2id** — Substitui o bcrypt; migração transparente no primeiro login.
- **Motor de Risco** — Pontua cada login por 5 sinais de ameaça (dispositivo, IP, taxa de falhas, bloqueio, reutilização). Pontuação `critical` (≥80) bloqueia o login e revoga todas as sessões imediatamente.
- **Verificação de senha atual** — `change-password` exige a senha atual; previne tomada de conta via token de acesso roubado.
- **Trust proxy habilitado** — Garante que os IPs reais dos clientes sejam usados no rate limiting e nos logs de auditoria quando implantado atrás de Nginx/ALB.

## Camada de Banco (Drizzle)

- O acesso ao banco em runtime usa `DatabaseService` com `drizzle-orm` e pool `pg`.
- Os schemas ficam em `src/database/schema`.
- As migrations SQL são geradas/aplicadas com `drizzle-kit` via `drizzle.config.ts`.
- Todas as queries de usuário filtram `deletedAt IS NULL` — usuários com soft-delete são completamente excluídos.
