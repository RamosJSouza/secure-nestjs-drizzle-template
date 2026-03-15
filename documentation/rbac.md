# RBAC (Controle de Acesso Baseado em Papéis)

O sistema implementa controle de acesso granular com a cadeia:

**Feature → Permission → RolePermission → Role → User**

## Entidades

### 1. Feature (Funcionalidade)
Módulo ou recurso do sistema.
- **Campos:** `key`, `name`, `description`, `isActive`
- **Exemplos:** `rbac`, `users`, `financial`, `project`

### 2. Permission (Permissão)
Ação específica dentro de uma Feature.
- **Relação:** Pertence a uma `Feature`
- **Formato:** `featureKey:action` (ex: `rbac:view`, `users:create`, `project:read`)
- **Ações comuns:** `view`, `create`, `edit`, `delete`, `assign_permissions`
- **Formato slug obrigatório:** campo `action` validado com `/^[a-z0-9_-]+$/`

### 3. Role (Papel)
Conjunto de permissões.
- **Campos:** `name`, `description`, `isActive`
- **Exemplos:** Super Admin, Manager, Viewer

### 4. RolePermission
Associação Role ↔ Permission.
- **Campos:** `roleId`, `permissionId`, `granted` (boolean)
- Toda chamada a `assignPermissions` gera diff antes/depois no audit log (`rbac.role.permissions_assigned`)

### 5. User (Usuário)
Usuário do sistema.
- **Relação:** Vinculado a uma `Role` (`roleId`) e opcionalmente a uma `Organization` (`organizationId`)
- Role sempre recarregada do banco a cada requisição — nunca inferida do JWT

## Proteção de Rotas

### Endpoints padrão (sem tenant)
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

### Endpoints com escopo de tenant (multi-tenancy)
Adicione `TenantGuard` + `@RequireTenant()` quando o recurso pertencer a uma organização:

```typescript
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequireTenant()                        // 403 se usuário não tiver organizationId
@Controller('projects')
export class ProjectsController {
  @Get()
  @RequirePermissions('project:read')
  findAll(@Req() req: Request) {
    const orgId = (req.user as any).organizationId as string;
    return this.projectsService.findAll(orgId);
  }
}
```

**Fluxo de segurança para endpoints com tenant:**
```
JwtAuthGuard → TenantGuard → PermissionGuard
     ↓               ↓              ↓
 valida JWT    verifica orgId   verifica permissão
 (RS256)       no RequestContext   no banco (DB)
```

Veja o exemplo completo em [`docs/examples/rbac-multi-tenant.md`](../docs/examples/rbac-multi-tenant.md).

## Verificação de Permissões

O `PermissionGuard` usa `RbacService` para verificar se a `Role` do usuário possui a permissão em `role_permissions` com `granted = true`. A verificação ocorre no banco a cada requisição — alterações de role têm efeito imediato sem re-login.

### Modo estrito
Defina `PERMISSION_GUARD_STRICT=true` para que o guard falhe fechado (HTTP 403) quando `@RequirePermissions` estiver ausente. Padrão: fail-open com log WARN (permite rotas protegidas por outros meios, ex: `JwtAuthGuard` apenas).

## Parâmetros UUID

Todos os parâmetros de rota UUID usam `ParseUUIDPipe`:
```typescript
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) { ... }
```
Valores inválidos retornam HTTP 400 antes de atingir o banco.

## Endpoints RBAC

| Recurso | GET | GET/:id | POST | PUT/:id | DELETE/:id |
|---------|-----|---------|------|---------|------------|
| Features | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Roles | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Permissions | rbac:view | — | rbac:create | rbac:edit | rbac:delete |
| Atribuir perms | — | — | `rbac:assign_permissions` (POST /roles/:id/permissions) | — | — |
