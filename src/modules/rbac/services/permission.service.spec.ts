import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { DatabaseService } from '@/database/database.service';

describe('PermissionService', () => {
  let service: PermissionService;

  const mockReturning = jest.fn();
  const mockInsert = jest.fn().mockReturnThis();
  const mockValues = jest.fn().mockReturnThis();
  const mockDelete = jest.fn().mockReturnThis();
  const mockWhere = jest.fn();
  const mockUpdate = jest.fn().mockReturnThis();
  const mockSet = jest.fn().mockReturnThis();

  const mockDb = {
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    delete: mockDelete,
    where: mockWhere,
    update: mockUpdate,
    set: mockSet,
    query: {
      permissions: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    },
  };

  const mockDatabaseService = { db: mockDb };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a new permission', async () => {
    const dto = { action: 'view', name: 'View Permission', featureId: 'feature-1' };
    mockReturning.mockResolvedValue([{ id: '1', ...dto }]);

    const result = await service.create(dto);
    expect(result).toEqual({ id: '1', ...dto });
  });

  it('should throw ConflictException on duplicate permission', async () => {
    const error = new Error('Unique constraint');
    (error as any).code = '23505';
    mockReturning.mockRejectedValue(error);

    await expect(service.create({ action: 'view', name: 'Dup', featureId: 'ft-1' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should find permissions by feature', async () => {
    const items = [{ id: '1', action: 'view' }, { id: '2', action: 'edit' }];
    mockDb.query.permissions.findMany.mockResolvedValue(items);

    const result = await service.findByFeature('feature-1');
    expect(result).toHaveLength(2);
  });
});
