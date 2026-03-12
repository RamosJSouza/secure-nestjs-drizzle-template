import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '@/database/database.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockSelect = jest.fn().mockReturnThis();
  const mockFrom = jest.fn().mockReturnThis();
  const mockWhere = jest.fn().mockReturnThis();
  const mockLimit = jest.fn();
  const mockInsert = jest.fn().mockReturnThis();
  const mockValues = jest.fn().mockReturnThis();
  const mockReturning = jest.fn();
  const mockUpdate = jest.fn().mockReturnThis();
  const mockSet = jest.fn().mockReturnThis();

  const mockDb = {
    select: mockSelect,
    from: mockFrom,
    where: mockWhere,
    limit: mockLimit,
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    update: mockUpdate,
    set: mockSet,
    transaction: jest.fn(),
  };

  const mockDatabaseService = {
    db: mockDb,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createUserDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
      };

      const savedUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        ...createUserDto,
        roleId: null,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockReturning.mockResolvedValue([savedUser]);

      const result = await service.create(createUserDto);

      expect(result).toEqual(savedUser);
    });
  });

  describe('findOne', () => {
    it('should return a user by email', async () => {
      const email = 'test@example.com';
      const user = { id: 'uuid-1', email, name: 'Test User', password: 'hash', isActive: true };

      mockLimit.mockResolvedValue([user]);

      const result = await service.findOne(email);

      expect(result).toEqual(user);
    });

    it('should return undefined when user not found', async () => {
      mockLimit.mockResolvedValue([]);

      const result = await service.findOne('notfound@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const user = { id, name: 'Test User', email: 'test@example.com' };

      mockLimit.mockResolvedValue([user]);

      const result = await service.findById(id);

      expect(result).toEqual(user);
    });
  });

  describe('remove', () => {
    it('should soft delete a user by setting deletedAt', async () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      mockWhere.mockResolvedValue(undefined);

      await service.remove(id);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
    });
  });
});
