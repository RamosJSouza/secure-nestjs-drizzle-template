import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { permissions, Permission } from '@/database/schema/permissions.schema';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  async create(dto: CreatePermissionDto): Promise<Permission> {
    this.logger.debug(`Creating permission: ${dto.featureId}:${dto.action}`);
    try {
      const [permission] = await this.db.insert(permissions).values(dto).returning();
      return permission;
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictException(`Permission "${dto.action}" for this feature already exists`);
      }
      throw err;
    }
  }

  async findByFeature(featureId: string): Promise<Permission[]> {
    return this.db.query.permissions.findMany({
      with: { feature: true },
      where: eq(permissions.featureId, featureId),
      orderBy: asc(permissions.action),
    });
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.db.query.permissions.findFirst({
      with: { feature: true },
      where: eq(permissions.id, id),
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID "${id}" not found`);
    }

    return permission;
  }

  async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    await this.db
      .update(permissions)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(permissions.id, id));
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    try {
      await this.db.delete(permissions).where(eq(permissions.id, id));
    } catch (err) {
      if (err.code === '23503') {
        throw new ConflictException(
          'Cannot delete permission that is assigned to roles. Revoke it first.',
        );
      }
      throw err;
    }
  }
}
