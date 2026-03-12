# NestJS Security Pro

[![Build Status](https://img.shields.io/github/actions/workflow/status/<OWNER>/<REPO>/ci.yml?branch=main&label=build)](https://github.com/<OWNER>/<REPO>/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-339933.svg)](https://nodejs.org/)

Production-ready secure backend architecture with NestJS, Drizzle ORM, RBAC, and JWT RS256.

## Why NestJS Security Pro

Most templates help you ship fast.  
**NestJS Security Pro helps you ship fast and pass security review.**

It is designed for teams building SaaS, fintech, health, and enterprise products that must meet security and governance requirements such as:

- SOC 2 readiness (traceability, access control, audit evidence)
- GDPR-oriented controls (least privilege, event traceability, operational accountability)
- Internal security review and incident response workflows

Instead of assembling auth, RBAC, logging, health checks, and database patterns from scratch, you start from a hardened baseline and save weeks of architecture work.

## Value-Driven Features

- **Enterprise-Grade Auth (RS256 JWT)** - prevents shared-secret leakage risk with asymmetric keys.
- **Refresh Token Rotation + Reuse Detection** - blocks replay attacks and revokes compromised session chains.
- **Audit-Ready Session Revocation** - preserves `revoked_at` history for forensic integrity.
- **Database-Driven RBAC** - avoids hardcoded roles and enables immediate permission changes without redeploy.
- **Append-Only Audit Logging** - creates reliable evidence trails for compliance and incident analysis.
- **Fail-Fast Configuration Validation** - stops insecure startup in production when critical env vars are missing.
- **Secure-by-Default API Hardening** - includes rate limit, strict validation, Helmet, and CORS controls.
- **Production Observability** - structured logs with correlation IDs, liveness/readiness probes, graceful shutdown.
- **Drizzle ORM + Migration Workflow** - predictable schema evolution with explicit SQL migrations.

## Architecture Snapshot

- **Framework:** NestJS
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** JWT RS256 (access 15m, refresh 7d)
- **Authorization:** RBAC (`Feature -> Permission -> RolePermission -> Role -> User`)
- **Cache/Infra:** Redis
- **Observability:** Pino + correlation ID + health endpoints

## Quick Start

```bash
cp .env.example .env
npm install
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
npm run db:migrate
npm run seed:rbac
npm run dev
```

Open API docs: `http://localhost:3000/api/docs`

### Database Commands (Drizzle)

```bash
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply migrations
npm run db:studio     # open Drizzle Studio
```

## Environment Essentials

- Runtime DB: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL`
- Drizzle tooling: `DATABASE_URL` (optional, preferred for CLI tooling)
- Auth keys: `PRIVATE_KEY`, `PUBLIC_KEY`
- Security: `ALLOWED_ORIGINS` (required in production)

See full details in:

- `docs/en/configuration.md`
- `docs/pt-br/configuracao.md`

## Compliance-Oriented Use Cases

- Build an admin backend with permissioned operations and complete auditability.
- Enforce secure token lifecycle with replay detection and controlled session invalidation.
- Provide structured logs and trace IDs for incident response and security operations.
- Establish a reusable backend baseline for regulated product teams.

## 📚 Deep Dive & Tutorials

Technical references from Ramos da Informatica (replace/add links as needed):

- [Security in Docker: Lessons from Real Incidents](https://ramosdainformatica.com.br/seguranca-em-docker-licoes-de-incidentes-reais/)
- [How to Install and Configure SonarQube for Node.js Projects](https://ramosdainformatica.com.br/como-instalar-e-configurar-sonarqube-para-projetos-node-js/)
- [Redis Performance with Relational Databases](https://ramosdainformatica.com.br/performance-em-aplicacoes-com-bancos-de-dados-relacionais-usando-redis/)
- [Kubernetes Explained with Practical Diagrams](https://ramosdainformatica.com.br/kubernetes-explicado-com-diagramas-que-fazem-sentido/)
- [Elasticsearch with Node.js: Practical Guide](https://ramosdainformatica.com.br/o-que-e-o-elasticsearch-e-como-instalar-e-utilizar-com-o-node/)

Placeholders to customize with your own authority content:

- [NestJS Security Blueprint for SOC2](https://ramosdainformatica.com.br/nestjs-security-blueprint-arquitetura-de-backend-pronta-para-soc2/)
- [JWT Rotation and Session Defense in Practice](https://ramosdainformatica.com.br/rotacao-de-jwt-e-defesa-de-sessao-na-pratica-com-nestjs/)


## Contribute or Hire Expert Help

- **Contribute:** open issues, improve docs, add tests, or submit hardening improvements via PR.
- **Consulting:** if your team needs secure architecture, compliance-focused backend design, or modernization support, reach out:
  - Website: [ramosdainformatica.com.br](https://ramosdainformatica.com.br/)
  - LinkedIn: [Ramos de Souza Janones](https://www.linkedin.com/in/ramos-souza/)

## Authority Note (PT-BR)

Este projeto e sua arquitetura sao mantidos por **Ramos de Souza Janones**, engenheiro senior com foco em Node.js/NestJS, seguranca de aplicacoes e arquiteturas prontas para producao e auditoria.

## Documentation

- English docs: `docs/en/`
- Portugues: `docs/pt-br/`
- Legacy mirror: `documentation/`
