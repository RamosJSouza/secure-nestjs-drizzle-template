import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { rolePermissions } from '@/database/schema/role-permissions.schema';

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
      return requiredPermissions.every((perm) => userPermissions.includes(perm));
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
        `Redis cache get failed for ${cacheKey}, falling back to DB`,
        error.message,
      );
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const rows = await this.dbService.db.query.rolePermissions.findMany({
          with: {
            permission: {
              with: { feature: true },
            },
          },
          where: and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.granted, true),
          ),
        });

        const permissions = rows.map(
          (rp) => `${rp.permission.feature.key}:${rp.permission.action}`,
        );

        this.cacheManager.set(cacheKey, permissions, this.ttl).catch((err) => {
          this.logger.warn(`Redis cache set failed for ${cacheKey}`, err.message);
        });

        return permissions;
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
}
