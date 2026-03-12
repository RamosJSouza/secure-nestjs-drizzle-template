import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { RbacService } from './rbac.service';
import { DatabaseService } from '@/database/database.service';

describe('RbacService', () => {
  let service: RbacService;
  let mockCacheManager: any;

  const mockFindMany = jest.fn();
  const mockDatabaseService = {
    db: {
      query: {
        rolePermissions: {
          findMany: mockFindMany,
        },
      },
    },
  };

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(300) },
        },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkPermissions', () => {
    it('should return false if roleId or permissions are missing', async () => {
      expect(await service.checkPermissions('', ['test:view'])).toBe(false);
      expect(await service.checkPermissions('role-id', [])).toBe(false);
    });

    it('should return true if user has all required permissions', async () => {
      const roleId = 'role-123';
      const requiredPermissions = ['test:view', 'test:edit'];

      mockCacheManager.get.mockResolvedValue(null);
      mockFindMany.mockResolvedValue([
        { permission: { action: 'view', feature: { key: 'test' } } },
        { permission: { action: 'edit', feature: { key: 'test' } } },
      ]);

      const result = await service.checkPermissions(roleId, requiredPermissions);
      expect(result).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should return false if user is missing a permission', async () => {
      mockCacheManager.get.mockResolvedValue(['test:view']);

      const result = await service.checkPermissions('role-123', ['test:view', 'test:admin']);
      expect(result).toBe(false);
    });

    it('should use cached permissions', async () => {
      mockCacheManager.get.mockResolvedValue(['test:view']);

      const result = await service.checkPermissions('role-123', ['test:view']);
      expect(result).toBe(true);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('should handle cache error gracefully (fallback to DB)', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Redis down'));
      mockFindMany.mockResolvedValue([
        { permission: { action: 'view', feature: { key: 'test' } } },
      ]);

      const result = await service.getPermissionsForRole('role-123');
      expect(result).toEqual(['test:view']);
    });
  });

  describe('invalidateRoleCache', () => {
    it('should delete keys from cache', async () => {
      await service.invalidateRoleCache('role-123');
      expect(mockCacheManager.del).toHaveBeenCalledWith('rbac:role:role-123:permissions');
    });
  });
});
