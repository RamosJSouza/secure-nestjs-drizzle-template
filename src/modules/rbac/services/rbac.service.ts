import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { eq, and, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { rolePermissions } from '@/database/schema/role-permissions.schema';
import { permissions } from '@/database/schema/permissions.schema';
import { features } from '@/database/schema/features.schema';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private readonly ttl: number;
  private readonly pendingRequests = new Map<string, Promise<string[]>>();

  constructor(
    private readonly dbService: DatabaseService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.ttl = this.configService.get<number>('RBAC_CACHE_TTL', 300000);
  }

  async checkPermissions(roleId: string, requiredPermissions: string[]): Promise<boolean> {
    if (!roleId || !requiredPermissions.length) {
      return false;
    }

    try {
      const userPermissions = await this.getPermissionsForRole(roleId);
      const granted = new Set(userPermissions);
      return requiredPermissions.every((perm) => granted.has(perm));
    } catch (error) {
      this.logger.error(`Critical RBAC error for role ${roleId}`, error.stack);
      return false;
    }
  }

  async getPermissionsForRole(roleId: string): Promise<string[]> {
    const cacheKey = `rbac:role:${roleId}:permissions`;

    try {
      const cached = await this.cacheManager.get<string[]>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      this.logger.warn(
        `Cache get failed for ${cacheKey}, falling back to DB`,
        error.message,
      );
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const rows = await this.dbService.db
          .select({
            permissionKey: sql<string>`${features.key} || ':' || ${permissions.action}`,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .innerJoin(features, eq(features.id, permissions.featureId))
          .where(
            and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.granted, true)),
          );

        const permissionKeys = rows.map((r) => r.permissionKey);

        this.cacheManager.set(cacheKey, permissionKeys, this.ttl).catch((err) => {
          this.logger.warn(`Cache set failed for ${cacheKey}`, err.message);
        });

        return permissionKeys;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  async invalidateRoleCache(roleId: string): Promise<void> {
    const cacheKey = `rbac:role:${roleId}:permissions`;
    this.pendingRequests.delete(cacheKey);

    try {
      await this.cacheManager.del(cacheKey);
      this.logger.log(`Invalidated cache for role ${roleId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate cache for role ${roleId}`, error.stack);
    }
  }

  async invalidateRolesForPermission(permissionId: string): Promise<void> {
    const rows = await this.dbService.db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, permissionId));

    await Promise.all(rows.map((r) => this.invalidateRoleCache(r.roleId)));
  }

  async invalidateRolesForFeature(featureId: string): Promise<void> {
    const rows = await this.dbService.db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(permissions.featureId, featureId));

    const uniqueRoleIds = [...new Set(rows.map((r) => r.roleId))];
    await Promise.all(uniqueRoleIds.map((roleId) => this.invalidateRoleCache(roleId)));
  }
}
