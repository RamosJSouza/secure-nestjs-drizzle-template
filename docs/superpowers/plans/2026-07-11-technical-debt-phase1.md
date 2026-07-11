# Technical Debt Remediation — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate P0/P1 technical debt from the controllers/services audit, plus selected P2 quick wins — eliminate duplicate audit logging, introduce HTTP param decorators, unify cache configuration, extract small shared helpers, and remove confirmed dead code.

**Architecture:** Keep the existing feature-based NestJS layout. Fix one audit boundary per use case (service-layer audit for `assignPermissions` because it captures diff metadata). Introduce `@CurrentUser()` and `@ClientContext()` param decorators in `src/common/decorators/`. Centralize `CacheModule` in the global `SecurityModule`. Defer god-service decomposition (CP-01), DDD folder migration (P3), Mail integration (DC-02), and UsersController exposure (DC-05) to Phase 2.

**Tech Stack:** NestJS 11, Drizzle ORM 0.44, `@nestjs/cache-manager`, Jest 30 (ts-jest), Terminus health checks. Scripts: `npm test`, `npm run type-check`, `npm run lint`.

**Source audit:** `docs/technical-debt/2026-07-11-controllers-services-audit.md`

**Recommended branch:** `refactor/technical-debt-phase1` — branch from `fix/auth-security-hardening` (or `main` after that branch merges).

---

## Scope Split

| In Phase 1 (this plan) | Deferred to Phase 2+ |
|------------------------|----------------------|
| DRY-07 duplicate audit + DC-08 actorUserId | CP-01 AuthService decomposition |
| DRY-01, DRY-02 param decorators | CP-02 repository layer |
| CP-05 CacheModule unify | DC-02 MailModule integrate/remove |
| DC-01, DC-03, DC-06, DC-09, DC-10 dead code | DC-04 SecurityEventService wire-up |
| DRY-S01 PostgresErrorMapper (P2) | DC-05 UsersController |
| DRY-S04 session JTI revocation helper (P2) | DRY-03 composite RBAC decorators |
| CP-03 DatabaseHealthIndicator (P2) | DRY-04, DRY-05, DRY-06 |
| Git cleanup `src/tasks/` | DRY-S02, DRY-S03 |
| | DC-07 SecurityEventType enum cleanup |
| | CP-04 PermissionChecker interface |
| | CP-06 path aliases (partial — auth paths in Task 7) |
| | CP-07 WebhookEndpoints tenant context |
| | P3 DDD folder restructure |

Phase 2 plan (to be written): `docs/superpowers/plans/2026-07-11-technical-debt-phase2.md`

---

## File Structure

**Create:**
- `src/common/decorators/current-user.decorator.ts`
- `src/common/decorators/current-user.decorator.spec.ts`
- `src/common/decorators/client-context.decorator.ts`
- `src/common/decorators/client-context.decorator.spec.ts`
- `src/common/decorators/index.ts`
- `src/common/database/postgres-error.mapper.ts`
- `src/common/database/postgres-error.mapper.spec.ts`
- `src/modules/health/indicators/database.health.ts`
- `src/modules/health/indicators/database.health.spec.ts`
- `src/modules/rbac/controllers/role.controller.spec.ts`
- `src/security/token-revocation/token-revocation.service.spec.ts`

**Modify:**
- `src/modules/rbac/controllers/role.controller.ts:117-132` — remove `@Auditable`, add `@CurrentUser('id')`
- `src/auth/auth.controller.ts` — use decorators; remove manual guards
- `src/modules/rbac/services/role.service.spec.ts` — audit metadata test
- `src/auth/auth.controller.spec.ts` — update login/refresh/changePassword tests
- `src/security/security.module.ts:17` — single global CacheModule with explicit ttl/max
- `src/modules/rbac/rbac.module.ts:13-17` — remove duplicate CacheModule
- `src/auth/auth.service.ts`, `auth.module.ts`, `strategy/jwt.strategy.ts`
- `src/users/users.service.ts`, `src/security/token-revocation/token-revocation.service.ts`
- `src/modules/rbac/services/feature.service.ts`, `permission.service.ts`
- `src/modules/health/health.controller.ts`, `health.module.ts`
- `src/security/detection/suspicious-activity.service.ts:89`
- `src/app.controller.ts`

**Delete:**
- `src/logger/logger.service.ts`
- `src/modules/audit/base-audit.service.ts`
- `src/tasks/**` (orphan scaffold — not imported in `app.module.ts`)

**Conventions:** Tests live next to source as `*.spec.ts`. Use `@/` path alias. Commits: `refactor:`, `fix:`, `test:`, `chore:`.

---

### Task 1: DRY-07 + DC-08 — Single audit boundary and actorUserId for assignPermissions

**Files:**
- Modify: `src/modules/rbac/controllers/role.controller.ts:117-132`
- Test: `src/modules/rbac/services/role.service.spec.ts`
- Create: `src/modules/rbac/controllers/role.controller.spec.ts`

**Decision:** Keep service-layer audit (`role.service.ts:170-176`) — it records `added`, `removed`, `total`, and `actorUserId`. Remove controller `@Auditable` to prevent duplicate entries from `AuditInterceptor`.

- [ ] **Step 1: Write failing service test**

Add to `role.service.spec.ts` — declare `let auditLog: { log: jest.Mock }` in outer scope and assign in `beforeEach`:

```ts
let auditLog: { log: jest.Mock };

// in beforeEach providers, capture mock:
auditLog = { log: jest.fn().mockResolvedValue(undefined) };
// ... { provide: AuditLogService, useValue: auditLog },

describe('assignPermissions', () => {
  it('logs audit once with diff metadata and actorUserId', async () => {
    const roleId = '11111111-1111-1111-1111-111111111111';
    const actorId = '22222222-2222-2222-2222-222222222222';

    mockDb.query.roles.findFirst.mockResolvedValue({ id: roleId, name: 'Editor' });
    // findOne succeeds; before-state select returns one permission
    mockDb.select.mockReturnValue({ from: mockDb.from });
    mockDb.from.mockReturnValue({ where: mockDb.where });
    mockDb.where.mockReturnValue({
      then: (resolve: any) =>
        Promise.resolve([{ permissionId: 'aaa' }]).then(resolve),
    });
    mockDb.transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.delete.mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    mockTx.insert.mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    await service.assignPermissions(roleId, { permissionIds: ['bbb'] }, actorId);

    expect(auditLog.log).toHaveBeenCalledTimes(1);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac.role.permissions_assigned',
        entityId: roleId,
        actorUserId: actorId,
        metadata: expect.objectContaining({ added: ['bbb'], removed: ['aaa'], total: 1 }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test (baseline)**

Run: `npm test -- role.service.spec`
Expected: PASS (confirms service audit behavior before controller change)

- [ ] **Step 3: Update controller — remove @Auditable AND wire actorUserId**

```ts
import { CurrentUser } from '@/common/decorators';

// assignPermissions — REMOVE @Auditable line 120, update signature:
assignPermissions(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: AssignPermissionsDto,
  @CurrentUser('id') actorUserId: string,
) {
  return this.roleService.assignPermissions(id, dto, actorUserId);
}
```

- [ ] **Step 4: Write controller test**

```ts
// src/modules/rbac/controllers/role.controller.spec.ts
describe('RoleController assignPermissions', () => {
  it('passes actorUserId to service', async () => {
    const roleService = { assignPermissions: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [{ provide: RoleService, useValue: roleService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(RoleController);
    const roleId = '11111111-1111-1111-1111-111111111111';
    const actorId = '22222222-2222-2222-2222-222222222222';

    await controller.assignPermissions(roleId, { permissionIds: ['p1'] }, actorId as any);

    expect(roleService.assignPermissions).toHaveBeenCalledWith(
      roleId,
      { permissionIds: ['p1'] },
      actorId,
    );
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- role.service.spec role.controller.spec && npm run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/rbac/controllers/ src/modules/rbac/services/role.service.spec.ts
git commit -m "fix: single audit boundary and actor id on role permission assignment"
```

---

### Task 2: @CurrentUser param decorator (DRY-02)

**Files:**
- Create: `src/common/decorators/current-user.decorator.ts`
- Create: `src/common/decorators/current-user.decorator.spec.ts`
- Create: `src/common/decorators/index.ts` — export **CurrentUser only** (ClientContext added in Task 3)

- [ ] **Step 1: Write the failing test**

```ts
// src/common/decorators/current-user.decorator.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

function getParamDecoratorFactory(decorator: ParameterDecorator) {
  class Host {
    handler(@decorator() _value: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Host, 'handler');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser', () => {
  it('returns full user when no property key', () => {
    const factory = getParamDecoratorFactory(CurrentUser());
    const user = { id: 'u1', email: 'a@b.com' };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual(user);
  });

  it('returns user property when key provided', () => {
    const factory = getParamDecoratorFactory(CurrentUser('id'));
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
    } as ExecutionContext;
    expect(factory('id', ctx)).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- current-user.decorator.spec`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement decorator**

```ts
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
```

```ts
// src/common/decorators/index.ts — Task 2 only:
export { CurrentUser } from './current-user.decorator';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- current-user.decorator.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/common/decorators/
git commit -m "refactor: add CurrentUser param decorator"
```

---

### Task 3: @ClientContext param decorator (DRY-01)

**Files:**
- Create: `src/common/decorators/client-context.decorator.ts`
- Create: `src/common/decorators/client-context.decorator.spec.ts`
- Modify: `src/common/decorators/index.ts` — add ClientContext export

- [ ] **Step 1: Write the failing test** (same factory helper as Task 2)

```ts
describe('ClientContext', () => {
  it('extracts ip and userAgent from request', () => {
    const factory = getParamDecoratorFactory(ClientContext());
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '10.0.0.1',
          get: (h: string) => (h === 'user-agent' ? 'jest-agent' : undefined),
        }),
      }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual({ ip: '10.0.0.1', userAgent: 'jest-agent' });
  });
});
```

- [ ] **Step 2: Run test — Expected FAIL**

- [ ] **Step 3: Implement**

```ts
// src/common/decorators/client-context.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface ClientContextData {
  ip?: string;
  userAgent?: string;
}

export const ClientContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientContextData => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return {
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: req.get('user-agent') ?? undefined,
    };
  },
);
```

Update `index.ts`: `export { ClientContext, ClientContextData } from './client-context.decorator';`

- [ ] **Step 4: Run test — Expected PASS**

- [ ] **Step 5: Commit**

```bash
git add src/common/decorators/
git commit -m "refactor: add ClientContext param decorator"
```

---

### Task 4: Refactor AuthController (DRY-01 + DRY-02)

**Files:**
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.controller.spec.ts`

- [ ] **Step 1: Update all auth.controller.spec.ts tests before refactor**

```ts
// Extend mockAuthService:
refresh: jest.fn(),
changePassword: jest.fn(),
logout: jest.fn(),

// login — replace mockReq with client object:
const client = { ip: '127.0.0.1', userAgent: 'test-agent' };
await controller.login(loginDto, client as any);
expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'test-agent');

// refresh:
await controller.refresh(refreshDto, client as any);
expect(mockAuthService.refresh).toHaveBeenCalledWith(refreshDto, '127.0.0.1', 'test-agent');

// logout:
await controller.logout({ refresh_token: 'rt' }, 'u1' as any);
expect(mockAuthService.logout).toHaveBeenCalledWith('u1', 'rt');

// changePassword:
await controller.changePassword(dto, 'u1' as any, client as any);
expect(mockAuthService.changePassword).toHaveBeenCalledWith(
  'u1', dto.currentPassword, dto.newPassword, '127.0.0.1', 'test-agent',
);
```

- [ ] **Step 2: Refactor auth.controller.ts**

```ts
import { CurrentUser, ClientContext, ClientContextData } from '@/common/decorators';

async login(@Body() dto: LoginDto, @ClientContext() client: ClientContextData) {
  return this.authService.login(dto, client.ip, client.userAgent);
}

async refresh(@Body() dto: RefreshDto, @ClientContext() client: ClientContextData) {
  return this.authService.refresh(dto, client.ip, client.userAgent);
}

async logout(@Body() dto: RefreshDto, @CurrentUser('id') userId: string) {
  await this.authService.logout(userId, dto.refresh_token);
}

async changePassword(
  @Body() dto: ChangePasswordDto,
  @CurrentUser('id') userId: string,
  @ClientContext() client: ClientContextData,
) {
  return this.authService.changePassword(
    userId, dto.currentPassword, dto.newPassword, client.ip, client.userAgent,
  );
}
```

Remove: `Req`, `Request`, `UnauthorizedException` imports.

- [ ] **Step 3: Run tests**

Run: `npm test -- auth.controller.spec && npm run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.controller.spec.ts
git commit -m "refactor: use CurrentUser and ClientContext in auth controller"
```

---

### Task 5: CP-05 — Unify CacheModule configuration

**Files:**
- Modify: `src/security/security.module.ts:17`
- Modify: `src/modules/rbac/rbac.module.ts:13-17`

**Note:** In `app.module.ts`, `RbacModule` (L71) is imported **before** `SecurityModule` (L76). Both are `@Global()` and each calls `CacheModule.register()` — Nest may register two cache providers. `RbacService` also passes explicit TTL per `cacheManager.set()` via `RBAC_CACHE_TTL` config, so RBAC entry TTL is largely independent of module-level defaults.

- [ ] **Step 1: Baseline test**

Run: `npm test -- rbac.service.spec`
Expected: PASS

- [ ] **Step 2: Centralize in SecurityModule**

```ts
// src/security/security.module.ts
imports: [
  CacheModule.register({
    ttl: 300_000,
    max: 1000,
  }),
],
```

- [ ] **Step 3: Remove from RbacModule**

Remove `CacheModule` import and `imports: [CacheModule.register(...)]` entirely.

- [ ] **Step 4: Verify**

Run: `npm test && npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/security/security.module.ts src/modules/rbac/rbac.module.ts
git commit -m "refactor: unify CacheModule in global SecurityModule"
```

---

### Task 6: DC-06 + CP-06 — Clean auth.service dead code and path aliases

**Files:**
- Modify: `src/auth/auth.service.ts`, `auth.module.ts`, `strategy/jwt.strategy.ts`

- [ ] **Step 1: Confirm dead code**

Run: `rg "constantTimeCompare|timingSafeEqual|\bcount\(|from 'src/users|\busers\." src/auth/`
Expected: unused imports/method only in auth.service.ts

- [ ] **Step 2: Remove dead code and fix imports**

- `src/users/users.service` → `@/users/users.service`
- Remove unused: `count`, `users`, `User` (verify `User` type unused), `constantTimeCompare`, `timingSafeEqual`
- Same `@/users` fix in `jwt.strategy.ts`, `auth.module.ts`

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm test -- auth.service.spec auth.controller.spec`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/auth/
git commit -m "chore: remove dead code and standardize users import path"
```

---

### Task 7: DC-01 + DC-03 — Remove unused LoggerService and BaseAuditService

- [ ] **Step 1:** `rg "LoggerService|BaseAuditService" --glob "*.ts"` — expect definitions only
- [ ] **Step 2:** `git rm src/logger/logger.service.ts src/modules/audit/base-audit.service.ts`
- [ ] **Step 3:** `npm run type-check && npm test` — PASS
- [ ] **Step 4:** `git commit -m "chore: remove unused LoggerService and BaseAuditService"`

---

### Task 8: DC-09 + DC-10 — Minor dead code cleanup

- [ ] **Step 1:** Rename `triggerEmail` → `_triggerEmail` in `suspicious-activity.service.ts:89`
- [ ] **Step 2:** Remove `getPremiumEcho` from `app.controller.ts` and unused imports
- [ ] **Step 3:** `npm run type-check && npm test` — PASS
- [ ] **Step 4:** `git commit -m "chore: remove demo endpoint and mark unused blockIp param"`

---

### Task 9: DRY-S04 — Shared session JTI revocation helper

**Files:**
- Modify: `src/security/token-revocation/token-revocation.service.ts`
- Create: `src/security/token-revocation/token-revocation.service.spec.ts`
- Modify: `src/auth/auth.service.ts`, `src/users/users.service.ts`

- [ ] **Step 1: Write failing test**

```ts
describe('revokeSessionJtis', () => {
  it('flattens session credential fields and calls revokeMany', async () => {
    // ... mock cache + config ...
    await service.revokeSessionJtis(
      [{ accessTokenJti: 'a1', refreshTokenJti: 'r1' }],
      true,
    );
    expect(service.revokeMany).toHaveBeenCalledWith(['a1', 'r1'], 900, true);
  });
});
```

- [ ] **Step 2: Run — Expected FAIL**

- [ ] **Step 3: Add method to TokenRevocationService**

```ts
async revokeSessionJtis(
  sessions: { accessTokenJti: string | null; refreshTokenJti: string | null }[],
  failClosed = false,
): Promise<void> {
  const jtis = sessions
    .flatMap((s) => [s.accessTokenJti, s.refreshTokenJti])
    .filter((j): j is string => !!j);
  if (jtis.length === 0) return;
  await this.revokeMany(jtis, TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS, failClosed);
}
```

- [ ] **Step 4: Replace in auth.service and users.service**

```ts
// auth.service.ts — delegate private revokeSessionCredentials to:
await this.tokenRevocationService.revokeSessionJtis(sessions, failClosed);

// users.service.ts — pass .returning() result directly:
await this.tokenRevocationService.revokeSessionJtis(revoked, failClosed);
```

- [ ] **Step 5:** `npm test -- token-revocation auth.service users.service` — PASS
- [ ] **Step 6:** Commit

---

### Task 10: DRY-S01 — PostgresErrorMapper

**Files:**
- Create: `src/common/database/postgres-error.mapper.ts` + spec
- Modify: `feature.service.ts`, `permission.service.ts`

- [ ] **Step 1–5:** TDD as in prior draft (map 23505→Conflict, 23503→NotFound)
- [ ] **Step 6:** Commit `refactor: centralize PostgreSQL error mapping`

---

### Task 11: CP-03 — DatabaseHealthIndicator

**Files:**
- Create: `src/modules/health/indicators/database.health.ts`
- Create: `src/modules/health/indicators/database.health.spec.ts`
- Modify: `health.controller.ts`, `health.module.ts`

- [ ] **Step 1: Write failing test**

```ts
// database.health.spec.ts
describe('DatabaseHealthIndicator', () => {
  it('returns up when ping succeeds', async () => {
    const db = { ping: jest.fn().mockResolvedValue(undefined) };
    const healthIndicator = { check: jest.fn().mockReturnValue({ up: jest.fn().mockReturnValue({ database: { status: 'up' } }) }) };
    const indicator = new DatabaseHealthIndicator(healthIndicator as any, db as any);
    await expect(indicator.isHealthy('database')).resolves.toEqual({ database: { status: 'up' } });
  });
});
```

- [ ] **Step 2: Run — Expected FAIL**

- [ ] **Step 3: Implement indicator** (mirror logic from current `health.controller.ts:35-48`)

- [ ] **Step 4: Slim controller** — inject `DatabaseHealthIndicator`, remove `DatabaseService` and private `isDatabaseHealthy`

- [ ] **Step 5:** `npm test -- database.health && npm run type-check` — PASS

- [ ] **Step 6: Commit**

---

### Task 12: Git cleanup — remove orphan tasks module

- [ ] **Step 1: Check status**

Run: `git status src/tasks/`
If tracked: `git rm -r src/tasks/`. If untracked only: `rm -rf src/tasks/`.

- [ ] **Step 2: Confirm no imports**

Run: `rg "tasks/" src/ --glob "*.ts"` — no references in `app.module.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove unused tasks module scaffold"
```

---

### Task 13: Full regression

- [ ] **Step 1:** `npm test` — all PASS
- [ ] **Step 2:** `npm run type-check && npm run lint`
- [ ] **Step 3 (optional smoke):** `POST /roles/:id/permissions` — verify **one** audit row with action `rbac.role.permissions_assigned`
- [ ] **Step 4 (optional):** Update audit doc §7 with Phase 1 completion notes

---

## Risk Notes

- **DRY-07:** Audit action changes from `role.assign_permissions` to `rbac.role.permissions_assigned`. Update SIEM filters if needed.
- **CP-05:** Unifying cache modules removes duplicate `@Global()` registration; RBAC per-key TTL still controlled by `RBAC_CACHE_TTL` in `RbacService.set()`.
- **DC-02 Mail:** Intentionally untouched — requires product decision.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-technical-debt-phase1.md`.**

**If harness has subagents:** REQUIRED — use @superpowers:subagent-driven-development (fresh subagent per task + two-stage review).

**If no subagents:** Execute in current session using @superpowers:executing-plans with batch checkpoints.

**Ready to execute?**
