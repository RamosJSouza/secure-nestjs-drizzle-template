import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { DatabaseService } from '@/database/database.service';

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
  const mockUpdateSet = jest.fn().mockReturnThis();
  const mockUpdateWhere = jest.fn().mockResolvedValue([]);
  const mockUpdate = jest.fn().mockReturnValue({
    set: mockUpdateSet,
  });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

  const mockDb = {
    insert: mockInsert,
    update: mockUpdate,
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
    create: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    recordFailedLogin: jest.fn(),
    resetFailedLogin: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockDatabaseService = { db: mockDb };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockInsertValues });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: DatabaseService, useValue: mockDatabaseService },
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
});
