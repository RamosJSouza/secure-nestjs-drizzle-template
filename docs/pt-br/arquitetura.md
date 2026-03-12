# Arquitetura

## Visão Geral

O Prime Nest é um backend NestJS pronto para produção, com estrutura modular voltada a escalabilidade e manutenção. O sistema é **single-tenant**, com entidade `Organization` preparada para evolução futura para multi-tenancy.

## Módulos

| Módulo | Finalidade |
|--------|------------|
| AuthModule | Login, refresh, registro, alteração de senha |
| UsersModule | Gestão de usuários (criação via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| OrganizationsModule | Entidade Organization (placeholder) |
| AuditModule | Log de auditoria append-only |
| HealthModule | Probes de liveness e readiness |
| GracefulShutdownModule | Encerramento controlado |
| LoggerModule | Pino e Correlation ID |

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
├── logger/            # Pino, middleware de correlation ID
├── database/          # Módulo de banco e schema Drizzle
├── migrations/        # Scripts de seed
├── modules/
│   ├── audit/        # Log de auditoria
│   ├── health/       # Health checks
│   ├── organizations/ # Placeholder Organization
│   └── rbac/         # Entidades e serviços RBAC
├── users/            # UsersService
└── main.ts
```

## Decisões de Design

- **Sem schema sync em produção** — Apenas migrations do Drizzle.
- **Validação fail-fast** — Schema Joi valida na inicialização; produção exige variáveis obrigatórias.
- **Auditoria append-only** — Sem updates ou deletes em registros de auditoria.
- **Swagger exposto** — Intencional; facilita integração e geração de clientes.

## Camada de Banco (Drizzle)

- O acesso ao banco em runtime usa `DatabaseService` com `drizzle-orm` e pool `pg`.
- Os schemas ficam em `src/database/schema`.
- As migrations SQL são geradas/aplicadas com `drizzle-kit` via `drizzle.config.ts`.
