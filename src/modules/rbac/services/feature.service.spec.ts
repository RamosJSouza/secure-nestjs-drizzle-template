import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { DatabaseService } from '@/database/database.service';

describe('FeatureService', () => {
  let service: FeatureService;

  const mockReturning = jest.fn();
  const mockInsert = jest.fn().mockReturnThis();
  const mockValues = jest.fn().mockReturnThis();
  const mockDelete = jest.fn().mockReturnThis();
  const mockDeleteWhere = jest.fn();
  const mockUpdateReturning = jest.fn();
  const mockUpdate = jest.fn().mockReturnThis();
  const mockSet = jest.fn().mockReturnThis();
  const mockUpdateWhere = jest.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockCountSelect = jest.fn().mockReturnThis();
  const mockCountFrom = jest.fn().mockReturnThis();
  const mockCountWhere = jest.fn();

  const mockDb = {
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    delete: mockDelete,
    update: mockUpdate,
    set: mockSet,
    select: mockCountSelect,
    from: mockCountFrom,
    where: mockCountWhere,
    query: {
      features: {
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
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockCountSelect.mockReturnValue({ from: mockCountFrom });
    mockCountFrom.mockReturnValue({ where: mockCountWhere });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<FeatureService>(FeatureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a feature', async () => {
    const dto = { key: 'test', name: 'Test' };
    mockReturning.mockResolvedValue([{ id: '1', ...dto }]);

    const result = await service.create(dto as any);
    expect(result).toEqual({ id: '1', ...dto });
  });

  it('should throw ConflictException on duplicate key', async () => {
    const error = new Error('Unique constraint');
    (error as any).code = '23505';
    mockReturning.mockRejectedValue(error);

    await expect(service.create({ key: 'test', name: 'Test' } as any)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should return paginated results from findAll', async () => {
    mockDb.query.features.findMany.mockResolvedValue([]);
    mockCountWhere.mockResolvedValue([{ value: 0 }]);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(result).toEqual({ data: [], total: 0 });
    expect(mockDb.query.features.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 10 }),
    );
  });

  it('should throw NotFoundException when updating non-existent feature', async () => {
    mockUpdateReturning.mockResolvedValue([]);

    await expect(service.update('non-existent', { name: 'New' } as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when deleting feature with dependencies', async () => {
    const error = new Error('FK violation');
    (error as any).code = '23503';
    mockDeleteWhere.mockRejectedValue(error);

    await expect(service.remove('1')).rejects.toThrow(ConflictException);
  });
});
