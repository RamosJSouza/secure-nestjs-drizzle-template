# RBAC (Controle de Acesso Baseado em Papéis)

O sistema implementa controle de acesso granular com a cadeia:

**Feature → Permission → RolePermission → Role → User**

## Entidades

### 1. Feature
Módulo ou recurso.
- **Campos:** `key`, `name`, `description`, `isActive`
- **Exemplos:** `rbac`, `users`, `financial`

### 2. Permission
Ação dentro de uma Feature.
- **Relação:** Pertence a uma Feature
- **Formato:** `featureKey:action` (ex: `rbac:view`, `users:create`)
- **Ações comuns:** `view`, `create`, `edit`, `delete`, `assign_permissions`

### 3. Role
Conjunto de permissões.
- **Campos:** `name`, `description`, `isActive`
- **Exemplos:** Super Admin, Manager, Viewer

### 4. RolePermission
Associação Role ↔ Permission.
- **Campos:** `roleId`, `permissionId`, `granted` (boolean)

### 5. User
Usuário do sistema.
- **Relação:** Vinculado a uma Role (`roleId`)
- **Entidade:** `src/modules/rbac/entities/user.entity.ts`

## Proteção de Rotas

Todos os endpoints de mutação e leitura sensível exigem:
1. `JwtAuthGuard` — token Bearer válido
2. `PermissionGuard` — permissão específica via `@RequirePermissions`

Endpoints com escopo de tenant exigem adicionalmente:
3. `TenantGuard` — valida `organizationId` no `RequestContext`
4. `@RequireTenant()` — retorna `403` se o usuário não possui organização

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

// Controller com escopo de tenant (adiciona TenantGuard + @RequireTenant):
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequireTenant()
@Controller('projects')
export class ProjectsController {
  @Get()
  @RequirePermissions('project:read')
  findAll(@Req() req: Request) { ... }
}
```

Veja [docs/examples/rbac-multi-tenant.md](../examples/rbac-multi-tenant.md) para um exemplo completo e funcional com DTOs, service, module, SQL de RLS e testes E2E de isolamento.

## Verificação de Permissões

O `PermissionGuard` usa `RbacService` para verificar se a Role do usuário possui a Permission necessária em `role_permissions` com `granted = true`.

> **Modo estrito:** Defina `PERMISSION_GUARD_STRICT=true` no env para que o `PermissionGuard` falhe fechado (403) quando `@RequirePermissions` estiver ausente, em vez do comportamento padrão fail-open com log WARN.

## Endpoints RBAC

| Recurso | GET | GET/:id | POST | PUT/:id | DELETE/:id |
|---------|-----|---------|------|---------|------------|
| Features | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Roles | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Permissions | rbac:view | — | rbac:create | rbac:edit | rbac:delete |
| Atribuir perms | — | — | rbac:assign_permissions (POST /roles/:id/permissions) | — | — |
