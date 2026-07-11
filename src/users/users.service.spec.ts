import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '@/database/database.service';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { RequestContext } from '@/logger/request-context';

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

  const mockTokenRevocationService = {
    revokeMany: jest.fn().mockResolvedValue(undefined),
    isFailClosedEnabled: jest.fn().mockReturnValue(true),
    ACCESS_TOKEN_TTL_SECONDS: 900,
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
        { provide: TokenRevocationService, useValue: mockTokenRevocationService },
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
    const returningMock = jest.fn();
    const txMock = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({ returning: returningMock }),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockDb.transaction = jest.fn(async (fn: any) => fn(txMock));
      returningMock.mockResolvedValue([]);
      mockTokenRevocationService.revokeMany.mockResolvedValue(undefined);
      mockTokenRevocationService.isFailClosedEnabled.mockReturnValue(true);
    });

    it('soft-deletes the user (sets deletedAt) inside a transaction', async () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await service.remove(id);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });
  });

  describe('remove (VULN-03 revocation)', () => {
    const returningMock = jest.fn();
    const txMock = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({ returning: returningMock }),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockDb.transaction = jest.fn(async (fn: any) => fn(txMock));
      returningMock.mockResolvedValue([]);
      mockTokenRevocationService.revokeMany.mockResolvedValue(undefined);
      mockTokenRevocationService.isFailClosedEnabled.mockReturnValue(true);
    });

    it('revokes all active sessions AND sends both access+refresh JTIs to Redis', async () => {
      returningMock.mockResolvedValueOnce([
        { id: 's1', accessTokenJti: 'a1', refreshTokenJti: 'r1' },
        { id: 's2', accessTokenJti: null, refreshTokenJti: 'r2' },
      ]);

      await service.remove('user-uuid');

      expect(txMock.update).toHaveBeenCalledTimes(2); // users + sessions
      expect(mockTokenRevocationService.revokeMany).toHaveBeenCalledWith(
        expect.arrayContaining(['a1', 'r1', 'r2']),
        expect.any(Number),
        true, // failClosed
      );
    });

    it('rolls back (rethrows) when Redis revocation fails in fail-closed mode', async () => {
      returningMock.mockResolvedValueOnce([
        { id: 's1', accessTokenJti: 'a1', refreshTokenJti: 'r1' },
      ]);
      mockTokenRevocationService.revokeMany.mockRejectedValueOnce(new Error('redis down'));

      // revokeMany is awaited INSIDE the tx callback -> its rejection propagates
      // -> drizzle rolls back the soft-delete + session revocation.
      await expect(service.remove('user-uuid')).rejects.toThrow('redis down');
    });
  });

  describe('tenant scoping (VULN-03)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('findAll consults RequestContext.organizationId and applies a filter when present', async () => {
      const getOrgSpy = jest.spyOn(RequestContext, 'getOrganizationId');

      mockWhere.mockClear();

      // With org context: findAll must read it and pass a truthy AND-condition to where().
      await RequestContext.run({ correlationId: 't', organizationId: 'org-123' }, () =>
        service.findAll(),
      );

      expect(getOrgSpy).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
      const calls = mockWhere.mock.calls;
      const withOrgArg = calls[calls.length - 1]?.[0];
      expect(withOrgArg).toBeTruthy(); // the `and(isNull(deletedAt), eq(org, 'org-123'))` object

      // Without org context: findAll still filters by deletedAt; org filter is absent.
      mockWhere.mockClear();
      getOrgSpy.mockClear();
      await RequestContext.run({ correlationId: 't' }, () => service.findAll());
      expect(getOrgSpy).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });
});
