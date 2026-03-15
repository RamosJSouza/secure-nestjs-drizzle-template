# RBAC (Role-Based Access Control)

The system implements granular role-based access control with the chain:

**Feature → Permission → RolePermission → Role → User**

## Entities

### 1. Feature
Module or resource.
- **Fields:** `key`, `name`, `description`, `isActive`
- **Examples:** `rbac`, `users`, `financial`

### 2. Permission
Action within a Feature.
- **Relation:** Belongs to a Feature
- **Format:** `featureKey:action` (e.g. `rbac:view`, `users:create`)
- **Common actions:** `view`, `create`, `edit`, `delete`, `assign_permissions`

### 3. Role
Collection of permissions.
- **Fields:** `name`, `description`, `isActive`
- **Examples:** Super Admin, Manager, Viewer

### 4. RolePermission
Role ↔ Permission association.
- **Fields:** `roleId`, `permissionId`, `granted` (boolean)

### 5. User
System user.
- **Relation:** Linked to a Role (`roleId`)
- **Entity:** `src/modules/rbac/entities/user.entity.ts`

## Route Protection

All mutation and sensitive read endpoints require:
1. `JwtAuthGuard` — valid Bearer token
2. `PermissionGuard` — specific permission via `@RequirePermissions`

Tenant-scoped endpoints additionally require:
3. `TenantGuard` — validates `organizationId` in `RequestContext`
4. `@RequireTenant()` — returns `403` if the user has no organization

```typescript
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RoleController {
  @Get()
  @RequirePermissions('rbac:view')
  findAll() { ... }

  @Post()
  @RequirePermissions('rbac:create')
  create(@Body() dto: CreateRoleDto) { ... }
}

// Tenant-scoped controller (adds TenantGuard + @RequireTenant):
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequireTenant()
@Controller('projects')
export class ProjectsController {
  @Get()
  @RequirePermissions('project:read')
  findAll(@Req() req: Request) { ... }
}
```

See [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) for a complete working example with DTOs, service, module, RLS SQL policy, and E2E isolation tests.

## Permission Check

`PermissionGuard` uses `RbacService` to verify the user's Role has the required Permission in `role_permissions` with `granted = true`.

> **Strict mode:** Set `PERMISSION_GUARD_STRICT=true` in env to make `PermissionGuard` fail-closed (403) when `@RequirePermissions` is absent, instead of the default fail-open with WARN log.

## RBAC Endpoints

| Resource | GET | GET/:id | POST | PUT/:id | DELETE/:id |
|----------|-----|---------|------|---------|------------|
| Features | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Roles | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Permissions | rbac:view | — | rbac:create | rbac:edit | rbac:delete |
| Assign perms | — | — | rbac:assign_permissions (POST /roles/:id/permissions) | — | — |
