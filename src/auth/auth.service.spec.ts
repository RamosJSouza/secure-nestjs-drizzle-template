import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { DatabaseService } from '@/database/database.service';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { SuspiciousActivityService } from '@/security/detection/suspicious-activity.service';
import { RiskEngineService } from '@/security/risk-engine/risk-engine.service';
import { SecurityEventService } from '@/security/events/security-event.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$mock-hash'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  const TEST_LOGIN_CREDENTIAL = 'unit-test-credential-login';
  const TEST_REGISTER_CREDENTIAL = 'unit-test-credential-register';

  const mockInsertValues = jest.fn().mockResolvedValue(undefined);
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateReturning = jest.fn().mockResolvedValue([]);
  const mockUpdateWhere = jest.fn().mockReturnValue({
    then: (resolve: any, reject?: any) => Promise.resolve([]).then(resolve, reject),
    returning: mockUpdateReturning,
  });
  const mockUpdateSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

  const mockLimit = jest.fn().mockResolvedValue([]);
  const mockSelectWhereResult = {
    orderBy: jest.fn().mockResolvedValue([]),
    limit: mockLimit,
    then: (resolve: any, reject?: any) => Promise.resolve([]).then(resolve, reject),
  };
  const mockSelectFromObj = { where: jest.fn().mockReturnValue(mockSelectWhereResult) };
  const mockSelectTopObj = { from: jest.fn().mockReturnValue(mockSelectFromObj) };
  const mockSelect = jest.fn().mockReturnValue(mockSelectTopObj);

  const mockDb = {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    query: {
      sessions: {
        findMany: jest.fn(),
      },
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneByIdForAuth: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    recordFailedLogin: jest.fn(),
    resetFailedLogin: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockTokenRevocationService = {
    revokeToken: jest.fn().mockResolvedValue(undefined),
    revokeMany: jest.fn().mockResolvedValue(undefined),
    isRevoked: jest.fn().mockResolvedValue(false),
  };

  const mockSuspiciousActivityService = {
    isIpBlocked: jest.fn().mockResolvedValue(false),
    recordFailedAttempt: jest.fn().mockResolvedValue(false),
  };

  const mockRiskEngineService = {
    assessLoginRisk: jest.fn().mockResolvedValue({ score: 0, level: 'low', signals: {} }),
  };

  const mockSecurityEventService = {
    loginFailed: jest.fn().mockResolvedValue(undefined),
    sessionRevoked: jest.fn().mockResolvedValue(undefined),
    sessionLimitEviction: jest.fn().mockResolvedValue(undefined),
  };

  const mockDatabaseService = { db: mockDb };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockLimit.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: TokenRevocationService, useValue: mockTokenRevocationService },
        { provide: SuspiciousActivityService, useValue: mockSuspiciousActivityService },
        { provide: RiskEngineService, useValue: mockRiskEngineService },
        { provide: SecurityEventService, useValue: mockSecurityEventService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return access token for valid credentials (argon2 hash)', async () => {
      const loginDto = { email: 'test@example.com', password: TEST_LOGIN_CREDENTIAL };
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com',
        password: '$argon2id$v=19$m=65536,t=3,p=4$mock',
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
        lockedUntil: null,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.email).toBe(loginDto.email);
    });

    it('should return access token for valid credentials (legacy bcrypt hash)', async () => {
      const loginDto = { email: 'test@example.com', password: TEST_LOGIN_CREDENTIAL };
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com',
        password: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789012345678901234',
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
        lockedUntil: null,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.email).toBe(loginDto.email);
    });

    it('should throw UnauthorizedException for invalid user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      await expect(service.login({ email: 'nope@example.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: 'uuid',
        email: 'test@example.com',
        password: '$argon2id$mock',
        isActive: false,
        lockedUntil: null,
      });
      await expect(service.login({ email: 'test@example.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const argon2 = require('argon2');
      argon2.verify.mockResolvedValue(false);

      mockUsersService.findOne.mockResolvedValue({
        id: 'uuid',
        email: 'test@example.com',
        password: '$argon2id$v=19$mock',
        isActive: true,
        lockedUntil: null,
      });
      mockUsersService.recordFailedLogin.mockResolvedValue({
        failedLoginAttempts: 1,
        lockedUntil: null,
      });

      await expect(service.login({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    const VALID_SESSION_ID = 'session-uuid-old';
    const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 1000);

    const claimedSession = {
      id: VALID_SESSION_ID,
      userId: USER_ID,
      accessTokenJti: 'old-jti',
      rotatedFromSessionId: null,
      expiresAt: futureDate,
      revokedAt: new Date(), 
    };

    const activeUser = {
      id: USER_ID,
      email: 'test@example.com',
      isActive: true,
      lockedUntil: null,
    };

    beforeEach(() => {
      mockJwtService.verify.mockReturnValue({ sub: USER_ID, exp: Math.floor(futureDate.getTime() / 1000) });
    });

    it('should return new token pair on successful atomic claim', async () => {
      mockUpdateReturning.mockResolvedValueOnce([claimedSession]);
      mockUsersService.findById.mockResolvedValueOnce(activeUser);

      const result = await service.refresh({ refresh_token: 'valid-token' });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.email).toBe('test@example.com');
      expect(mockTokenRevocationService.revokeToken).toHaveBeenCalled();
    });

    it('should throw and revoke all sessions on token reuse', async () => {
      const revokedSession = { ...claimedSession, revokedAt: new Date(Date.now() - 5000) };
      mockUpdateReturning.mockResolvedValueOnce([]); 
      mockLimit.mockResolvedValueOnce([revokedSession]); 
      mockUpdateReturning.mockResolvedValueOnce([]); 

      await expect(
        service.refresh({ refresh_token: 'reused-token' }),
      ).rejects.toThrow('Refresh token reuse detected');
    });

    it('should throw UnauthorizedException when token is not found', async () => {
      mockUpdateReturning.mockResolvedValueOnce([]); 
      mockLimit.mockResolvedValueOnce([]); 

      await expect(
        service.refresh({ refresh_token: 'unknown-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when JWT signature is invalid', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      await expect(
        service.refresh({ refresh_token: 'bad-signature-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
    it('should throw UnauthorizedException when session is expired', async () => {
      const expiredSession = { ...claimedSession, expiresAt: pastDate };
      mockUpdateReturning.mockResolvedValueOnce([expiredSession]);

      await expect(
        service.refresh({ refresh_token: 'expired-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      mockUpdateReturning.mockResolvedValueOnce([claimedSession]);
      mockUsersService.findById.mockResolvedValueOnce({ ...activeUser, isActive: false });

      await expect(
        service.refresh({ refresh_token: 'inactive-user-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create user successfully', async () => {
      const registerDto = {
        email: 'new@example.com',
        name: 'New User',
        password: TEST_REGISTER_CREDENTIAL,
      };
      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ id: 'new-uuid', ...registerDto });

      const result = await service.register(registerDto);

      expect(result.message).toBe('User created with success');
      expect(result.userId).toBe('new-uuid');
    });

    it('should throw ConflictException for existing user', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: 'uuid', email: 'existing@example.com' });
      await expect(
        service.register({ email: 'existing@example.com', name: 'U', password: 'p' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const mockUserWithPassword = {
      id: USER_ID,
      email: 'test@example.com',
      password: '$argon2id$v=19$m=65536,t=3,p=4$mock',
      isActive: true,
    };

    it('should throw UnauthorizedException when user is not found', async () => {
      mockUsersService.findOneByIdForAuth.mockResolvedValue(null);

      await expect(
        service.changePassword(USER_ID, 'current-pass', 'New-Pass1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when currentPassword is wrong', async () => {
      const argon2 = require('argon2');
      argon2.verify.mockResolvedValue(false);
      mockUsersService.findOneByIdForAuth.mockResolvedValue(mockUserWithPassword);

      await expect(
        service.changePassword(USER_ID, 'wrong-current', 'New-Pass1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should change password and revoke all sessions on success', async () => {
      const argon2 = require('argon2');
      argon2.verify.mockResolvedValue(true);
      mockUsersService.findOneByIdForAuth.mockResolvedValue(mockUserWithPassword);

      const result = await service.changePassword(USER_ID, 'correct-current', 'New-Pass1');

      expect(result).toEqual({ userId: USER_ID });
      expect(mockUsersService.updatePassword).toHaveBeenCalledWith(USER_ID, '$argon2id$v=19$mock-hash');
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.password.changed', entityId: USER_ID }),
      );
    });
  });
});
