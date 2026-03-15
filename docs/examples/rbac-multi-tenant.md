# Example: RBAC + Multi-Tenancy (Projects CRUD)

This example shows how to build a **tenant-isolated CRUD endpoint** using:
- `PermissionGuard` + `@RequirePermissions()` for RBAC
- `TenantDatabaseService.withTenant()` for PostgreSQL RLS isolation
- `@RequireTenant()` to enforce tenant context on the route

The scenario: a `projects` resource where users can only read/write projects **within their own organization**.

---

## 1. Database Schema

```typescript
// src/database/schema/projects.ts
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';
import { relations } from 'drizzle-orm';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectsRelations = relations(projects, ({ one }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
}));
```

> Add to `src/database/schema/index.ts`: `export * from './projects';`

---

## 2. RLS Policy (apply once per environment)

```sql
-- src/database/rls/0002_projects_rls.sql
-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

-- Policy: rows are visible only when organization_id matches the current tenant
CREATE POLICY projects_tenant_isolation ON projects
  USING (organization_id::text = current_setting('app.current_tenant', true));
```

Apply with:
```bash
psql $DATABASE_URL -f src/database/rls/0002_projects_rls.sql
```

> **How it works:** `TenantDatabaseService.withTenant(orgId, fn)` calls `SET LOCAL app.current_tenant = '<orgId>'` inside a transaction. PostgreSQL RLS then automatically filters every `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `projects` — even if the service forgets a `WHERE` clause.

---

## 3. DTOs

```typescript
// src/modules/projects/dto/create-project.dto.ts
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Apollo' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Internal analytics platform' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
```

```typescript
// src/modules/projects/dto/update-project.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
```

---

## 4. Service (Tenant-Isolated)

```typescript
// src/modules/projects/projects.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DatabaseService } from 'src/database/database.service';
import { TenantDatabaseService } from 'src/tenant/tenant-database.service';
import { projects } from 'src/database/schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly tenantDb: TenantDatabaseService,
  ) {}

  async findAll(orgId: string) {
    // withTenant sets app.current_tenant for RLS + adds explicit WHERE (belt-and-suspenders)
    return this.tenantDb.withTenant(orgId, (db) =>
      db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, orgId), // explicit — never trust RLS alone
            eq(projects.isActive, true),
          ),
        ),
    );
  }

  async findOne(id: string, orgId: string) {
    const [project] = await this.tenantDb.withTenant(orgId, (db) =>
      db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, id),
            eq(projects.organizationId, orgId),
            eq(projects.isActive, true),
          ),
        )
        .limit(1),
    );

    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async create(dto: CreateProjectDto, orgId: string, userId: string) {
    const [created] = await this.tenantDb.withTenant(orgId, (db) =>
      db
        .insert(projects)
        .values({
          name: dto.name,
          description: dto.description ?? null,
          organizationId: orgId,
          createdById: userId,
        })
        .returning(),
    );
    return created;
  }

  async update(id: string, dto: UpdateProjectDto, orgId: string) {
    await this.findOne(id, orgId); // 404 if not found or cross-tenant
    const [updated] = await this.tenantDb.withTenant(orgId, (db) =>
      db
        .update(projects)
        .set({ ...dto, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)))
        .returning(),
    );
    return updated;
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId); // 404 guard
    await this.tenantDb.withTenant(orgId, (db) =>
      db
        .update(projects)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.organizationId, orgId))),
    );
  }
}
```

---

## 5. Controller (RBAC + Tenant guards)

```typescript
// src/modules/projects/projects.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Req, ParseUUIDPipe, HttpCode, HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { RequireTenant } from 'src/tenant/require-tenant.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequireTenant()                          // 403 if no organization in JWT
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  private getOrgId(req: Request): string {
    // organizationId is set by JwtStrategy via RequestContext after JWT validation
    return (req.user as any).organizationId as string;
  }

  @Get()
  @RequirePermissions('project:read')    // RBAC permission key (DB-driven)
  @ApiOperation({ summary: 'List all projects for the current tenant' })
  findAll(@Req() req: Request) {
    return this.projectsService.findAll(this.getOrgId(req));
  }

  @Get(':id')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: 'Get a single project by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.projectsService.findOne(id, this.getOrgId(req));
  }

  @Post()
  @RequirePermissions('project:write')
  @ApiOperation({ summary: 'Create a project (scoped to current tenant)' })
  create(@Body() dto: CreateProjectDto, @Req() req: Request) {
    const user = req.user as any;
    return this.projectsService.create(dto, this.getOrgId(req), user.id);
  }

  @Put(':id')
  @RequirePermissions('project:write')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.update(id, dto, this.getOrgId(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('project:delete')
  @ApiOperation({ summary: 'Soft-delete a project' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.projectsService.remove(id, this.getOrgId(req));
  }
}
```

---

## 6. Module

```typescript
// src/modules/projects/projects.module.ts
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  // DatabaseModule and TenantModule are @Global() — no need to import here
})
export class ProjectsModule {}
```

Register in `src/app.module.ts`:
```typescript
import { ProjectsModule } from './modules/projects/projects.module';

@Module({
  imports: [
    // ... existing modules
    ProjectsModule,
  ],
})
export class AppModule {}
```

---

## 7. Seed: RBAC Permissions for Projects

```typescript
// Add to src/migrations/seeds/run-seed.ts (or a separate seed file)

const projectPermissions = [
  { name: 'project:read',   description: 'Read projects within tenant' },
  { name: 'project:write',  description: 'Create and update tenant projects' },
  { name: 'project:delete', description: 'Soft-delete tenant projects' },
];

// Insert permissions and assign to your admin role...
```

---

## 8. Security Flow Diagram

```
POST /projects  (Bearer: <access_token>)
        │
        ▼
  JwtAuthGuard            → validates RS256 JWT, sets req.user
        │
        ▼
  TenantGuard             → reads RequestContext.getOrganizationId()
  (@RequireTenant)          if absent → 403 Forbidden
        │
        ▼
  PermissionGuard         → checks user's role → permissions in DB
  (@RequirePermissions      project:write required
   'project:write')         if absent → 403 Forbidden
        │
        ▼
  ProjectsService.create()
        │
        ▼
  tenantDb.withTenant(orgId, fn)
    BEGIN TRANSACTION
    SET LOCAL app.current_tenant = '<orgId>'   ← PostgreSQL session variable
    INSERT INTO projects (organization_id = orgId, ...)
    PostgreSQL RLS policy: organization_id::text = current_setting(...)
    COMMIT
```

---

## 9. Testing Cross-Tenant Isolation

```typescript
// test/projects-isolation.e2e-spec.ts (excerpt)
it('should not return projects from a different organization', async () => {
  const { token: tokenA, orgId: orgA } = await loginAs('user-org-a');
  const { token: tokenB, orgId: orgB } = await loginAs('user-org-b');

  // Create project in org A
  await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ name: 'Secret Project' })
    .expect(201);

  // Org B should see 0 projects
  const res = await request(app.getHttpServer())
    .get('/projects')
    .set('Authorization', `Bearer ${tokenB}`)
    .expect(200);

  expect(res.body).toHaveLength(0);
});
```

---

## Key Security Guarantees

| Layer | Mechanism | What it prevents |
|-------|-----------|-----------------|
| JWT Guard | RS256 signature validation | Forged tokens |
| TenantGuard | RequestContext orgId presence | Anonymous tenant access |
| PermissionGuard | DB-driven RBAC check | Privilege escalation |
| Explicit WHERE | `eq(projects.organizationId, orgId)` | Application-level bypass |
| PostgreSQL RLS | `app.current_tenant` session var | DB-level cross-tenant leak |

Two independent isolation layers (application + database) ensure that even a bug in one layer cannot expose cross-tenant data.
