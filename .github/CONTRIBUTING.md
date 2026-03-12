# Contributing Guide / Guia de Contribuicao

Thanks for your interest in improving this project.
Obrigado por querer melhorar este projeto.

Security is a core value here. We welcome contributions that improve reliability, maintainability, and compliance-readiness.
Seguranca e um valor central aqui. Aceitamos contribuicoes que melhorem confiabilidade, manutencao e preparo para compliance.

---

## English

## How to Contribute

1. Fork the repository and create a branch from `main`.
2. Use clear branch names, for example:
   - `feat/rbac-permission-filter`
   - `fix/auth-refresh-reuse-check`
   - `docs/security-hardening`
3. Keep pull requests focused and small when possible.

## Security-First Standards

When contributing, always preserve these standards:

- Never commit secrets (`.env`, API keys, private keys, tokens, passwords).
- Do not weaken authentication or authorization flows.
- Preserve auditability (do not remove or bypass audit logs).
- Prefer explicit, defensive validation over permissive behavior.
- Keep secure defaults in place (CORS, rate limiting, guards, validation).
- Avoid introducing data leakage in logs or error messages.

## Local Checklist Before Opening a PR

- Run tests relevant to your changes.
- Ensure linting/formatting passes.
- Validate no sensitive data appears in changed files.
- If you touched auth/session code, verify session revocation and token behavior.
- If you changed database schema, include migration updates and clear notes.
- Update docs when behavior, env vars, or commands change.

## Pull Request Expectations

Please include in your PR description:

- What changed and why.
- Security impact (if any).
- How you tested it.
- Any migration or environment impact.

Suggested PR checklist:

- [ ] No secrets in commits
- [ ] Security controls preserved or improved
- [ ] Tests/lint passed
- [ ] Documentation updated
- [ ] Breaking changes documented

## Reporting Security Issues

If you find a vulnerability, please do **not** open a public issue with exploit details.
Use a private contact channel with maintainers first, including:

- Vulnerability summary
- Reproduction steps
- Potential impact
- Suggested remediation (if available)

---

## Portugues (PT-BR)

## Como Contribuir

1. Faca um fork do repositorio e crie uma branch a partir da `main`.
2. Use nomes de branch claros, por exemplo:
   - `feat/rbac-permission-filter`
   - `fix/auth-refresh-reuse-check`
   - `docs/security-hardening`
3. Mantenha os pull requests focados e pequenos quando possivel.

## Padroes com Foco em Seguranca

Ao contribuir, preserve sempre estes padroes:

- Nunca commitar segredos (`.env`, chaves de API, chaves privadas, tokens, senhas).
- Nao enfraquecer fluxos de autenticacao ou autorizacao.
- Preservar auditabilidade (nao remover ou burlar logs de auditoria).
- Preferir validacao explicita e defensiva em vez de comportamento permissivo.
- Manter defaults seguros (CORS, rate limiting, guards, validacao).
- Evitar vazamento de dados em logs ou mensagens de erro.

## Checklist Local Antes do PR

- Rode os testes relevantes para suas mudancas.
- Garanta que lint/formatacao passaram.
- Verifique se nao ha dados sensiveis nos arquivos alterados.
- Se mexeu em auth/sessoes, valide revogacao de sessao e comportamento de tokens.
- Se alterou schema de banco, inclua migracoes e notas claras.
- Atualize a documentacao quando houver mudanca de comportamento, variaveis de ambiente ou comandos.

## O que Esperamos no Pull Request

Inclua na descricao do PR:

- O que mudou e por que.
- Impacto de seguranca (se houver).
- Como foi testado.
- Impacto em migracoes ou ambiente.

Checklist sugerido:

- [ ] Sem segredos nos commits
- [ ] Controles de seguranca preservados ou melhorados
- [ ] Testes/lint passaram
- [ ] Documentacao atualizada
- [ ] Breaking changes documentados

## Reporte de Vulnerabilidades

Se voce encontrar uma vulnerabilidade, **nao** abra issue publica com detalhes de exploracao.
Entre em contato de forma privada com os mantenedores, incluindo:

- Resumo da vulnerabilidade
- Passos de reproducao
- Impacto potencial
- Sugestao de correcao (se houver)
