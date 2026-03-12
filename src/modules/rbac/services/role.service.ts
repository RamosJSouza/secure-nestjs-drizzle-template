import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, asc, count } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { roles, Role } from '@/database/schema/roles.schema';
import { rolePermissions } from '@/database/schema/role-permissions.schema';
import { users } from '@/database/schema/users.schema';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '../dto/role.dto';
import { RbacService } from './rbac.service';

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private rbacService: RbacService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, dto.name))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Role "${dto.name}" already exists`);
      }

      const [role] = await tx.insert(roles).values(dto).returning();
      this.logger.log(`Created new role: ${role.id}`);
      return role;
    });
  }

  async findAll(): Promise<Role[]> {
    return this.db.query.roles.findMany({
      with: {
        rolePermissions: {
          with: {
            permission: {
              with: { feature: true },
            },
          },
        },
      },
      orderBy: asc(roles.name),
    });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.db.query.roles.findFirst({
      with: {
        rolePermissions: {
          with: {
            permission: {
              with: { feature: true },
            },
          },
        },
      },
      where: eq(roles.id, id),
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    await this.findOne(id);

    if (dto.name) {
      const [existing] = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, dto.name))
        .limit(1);

      if (existing && existing.id !== id) {
        throw new ConflictException(`Role with name "${dto.name}" already exists`);
      }
    }

    const [updated] = await this.db
      .update(roles)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    if (dto.isActive !== undefined) {
      await this.rbacService.invalidateRoleCache(id);
    }

    this.logger.log(`Updated role ${id}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    const [{ value: userCount }] = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.roleId, id));

    if (userCount > 0) {
      this.logger.warn(`Attempt to delete role ${id} with ${userCount} users`);
      throw new ConflictException(`Cannot delete role with ${userCount} users assigned`);
    }

    await this.db.delete(roles).where(eq(roles.id, id));
    await this.rbacService.invalidateRoleCache(id);
    this.logger.log(`Deleted role ${id}`);
  }

  async assignPermissions(
    roleId: string,
    dto: AssignPermissionsDto,
    currentUserId?: string,
  ): Promise<void> {
    await this.findOne(roleId);

    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

      const uniquePermissions = [...new Set(dto.permissionIds)];

      if (uniquePermissions.length > 0) {
        await tx.insert(rolePermissions).values(
          uniquePermissions.map((permissionId) => ({
            roleId,
            permissionId,
            granted: true,
          })),
        );
      }
    });

    await this.rbacService.invalidateRoleCache(roleId);

    this.logger.log(
      `Assigned ${dto.permissionIds.length} permissions to role ${roleId} by user ${currentUserId || 'system'}`,
    );
  }
}
