# Project Documentation

Technical documentation for **NestJS Security Pro** (`secure-nestjs-drizzle-template`).

> **Canonical docs:** prefer [`docs/en/`](../docs/en/) (English) and [`docs/pt-br/`](../docs/pt-br/) (Português). This folder contains legacy/supplementary references kept for backward compatibility.

## Documentation Index

| Language | Path |
|----------|------|
| **English** | [docs/en/](../docs/en/) |
| **Português** | [docs/pt-br/](../docs/pt-br/) |

### Topics (canonical)

| Topic | English | Português |
|-------|---------|-----------|
| Architecture | [architecture.md](../docs/en/architecture.md) | [arquitetura.md](../docs/pt-br/arquitetura.md) |
| Authentication | [authentication.md](../docs/en/authentication.md) | [autenticacao.md](../docs/pt-br/autenticacao.md) |
| RBAC | [rbac.md](../docs/en/rbac.md) | [rbac.md](../docs/pt-br/rbac.md) |
| Configuration | [configuration.md](../docs/en/configuration.md) | [configuracao.md](../docs/pt-br/configuracao.md) |
| Security | [security.md](../docs/en/security.md) | [seguranca.md](../docs/pt-br/seguranca.md) |
| Observability | [observability.md](../docs/en/observability.md) | [observabilidade.md](../docs/pt-br/observabilidade.md) |
| Compliance | [compliance.md](../docs/en/compliance.md) | — |
| Deployment | [deployment.md](../docs/en/deployment.md) | [deployment.md](../docs/pt-br/deployment.md) |
| Multi-tenant example | [rbac-multi-tenant.md](../docs/examples/rbac-multi-tenant.md) | — |

### Legacy files in this folder

| File | Status |
|------|--------|
| [auth.md](./auth.md) | PT-BR quick reference (synced with canonical auth docs) |
| [rbac.md](./rbac.md) | PT-BR RBAC reference with multi-tenant patterns |
| [config.md](./config.md) | PT-BR configuration summary |
| [mail.md](./mail.md) | Módulo de e-mail transacional (Nodemailer / SMTP) |

### Module-specific docs

- [Audit Module](../src/modules/audit/README.md) — `@Auditable`, interceptor, `SecurityEventService`
