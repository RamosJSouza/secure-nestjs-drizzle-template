# RBAC (Role-Based Access Control)

O sistema implementa controle de acesso baseado em papéis com a cadeia:

**Feature → Permission → RolePermission → Role → User**

## Entidades

### 1. Feature (Funcionalidade)
Módulo ou recurso do sistema.
- **Campos:** `key`, `name`, `description`, `isActive`.
- **Exemplos:** `rbac`, `users`, `financial`.

### 2. Permission (Permissão)
Ação específica dentro de uma Feature.
- **Relação:** Pertence a uma `Feature`.
- **Formato:** `featureKey:action` (ex: `rbac:view`, `users:create`).
- **Ações comuns:** `view`, `create`, `edit`, `delete`, `assign_permissions`.

### 3. Role (Papel)
Conjunto de permissões.
- **Campos:** `name`, `description`, `isActive`.
- **Exemplos:** Super Admin, Manager, Viewer.

### 4. RolePermission
Associação Role ↔ Permission.
- **Campos:** `roleId`, `permissionId`, `granted` (boolean).

### 5. User (Usuário)
Usuário do sistema.
- **Relação:** Vinculado a uma `Role` (`roleId`).
- **Entidade canônica:** `src/modules/rbac/entities/user.entity.ts`.

## Proteção de rotas

Todos os endpoints de mutação (e leitura sensível) exigem:
1. `JwtAuthGuard` — token Bearer válido.
2. `PermissionGuard` — permissão específica via `@RequirePermissions`.

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
```

## Verificação de permissões

O `PermissionGuard` usa `RbacService` para verificar se a `Role` do usuário possui a permissão no banco (`role_permissions`):
1. Role ativa.
2. Existe `RolePermission` para a `Permission` com `granted = true`.

## Endpoints RBAC

| Recurso    | GET (listar) | GET/:id | POST | PUT/:id | DELETE/:id |
|------------|--------------|---------|------|---------|------------|
| Features   | rbac:view    | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Roles      | rbac:view    | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Permissions| rbac:view    | —       | rbac:create | rbac:edit | rbac:delete |
| Assign perms | —         | —       | rbac:assign_permissions (POST /roles/:id/permissions) | — | — |
