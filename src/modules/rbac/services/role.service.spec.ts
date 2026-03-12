import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RoleService } from './role.service';
import { RbacService } from './rbac.service';
import { DatabaseService } from '@/database/database.service';

describe('RoleService', () => {
  let service: RoleService;
  let mockRbacService: any;

  const mockTx = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };

  const mockDb = {
    transaction: jest.fn(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    query: {
      roles: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };

  const mockDatabaseService = { db: mockDb };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRbacService = { invalidateRoleCache: jest.fn() };

    // Default chaining
    mockDb.select.mockReturnValue({ from: mockDb.from });
    mockDb.from.mockReturnValue({ where: mockDb.where });
    mockDb.where.mockReturnValue({ limit: mockDb.limit });
    mockDb.update.mockReturnValue({ set: mockDb.set });
    mockDb.set.mockReturnValue({ where: mockDb.where });
    mockDb.delete.mockReturnValue({ where: mockDb.where });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: RbacService, useValue: mockRbacService },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a role in a transaction', async () => {
    const dto = { name: 'Admin' };

    mockTx.select.mockReturnValue({ from: mockTx.from });
    mockTx.from.mockReturnValue({ where: mockTx.where });
    mockTx.where.mockReturnValue({ limit: mockTx.limit });
    mockTx.limit.mockResolvedValue([]);
    mockTx.insert.mockReturnValue({ values: mockTx.values });
    mockTx.values.mockReturnValue({ returning: mockTx.returning });
    mockTx.returning.mockResolvedValue([{ id: '1', ...dto }]);

    mockDb.transaction.mockImplementation((fn: any) => fn(mockTx));

    const result = await service.create(dto as any);
    expect(result).toEqual({ id: '1', name: 'Admin' });
  });

  it('should prevent creating duplicate roles', async () => {
    mockTx.select.mockReturnValue({ from: mockTx.from });
    mockTx.from.mockReturnValue({ where: mockTx.where });
    mockTx.where.mockReturnValue({ limit: mockTx.limit });
    mockTx.limit.mockResolvedValue([{ id: 'existing', name: 'Admin' }]);

    mockDb.transaction.mockImplementation((fn: any) => fn(mockTx));

    await expect(service.create({ name: 'Admin' } as any)).rejects.toThrow(ConflictException);
  });

  it('should not delete role if users are assigned', async () => {
    mockDb.query.roles.findFirst.mockResolvedValue({ id: 'role-1', name: 'Admin' });
    mockDb.select.mockReturnValue({ from: mockDb.from });
    mockDb.from.mockReturnValue({ where: mockDb.where });
    mockDb.where.mockResolvedValue([{ value: 5 }]);

    await expect(service.remove('role-1')).rejects.toThrow(ConflictException);
  });

  it('should assign permissions transactionally', async () => {
    mockDb.query.roles.findFirst.mockResolvedValue({ id: 'role-1', name: 'Admin' });

    mockTx.delete.mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    mockTx.insert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });

    mockDb.transaction.mockImplementation((fn: any) => fn(mockTx));

    await service.assignPermissions('role-1', { permissionIds: ['p1', 'p2'] });
    expect(mockRbacService.invalidateRoleCache).toHaveBeenCalledWith('role-1');
  });
});
