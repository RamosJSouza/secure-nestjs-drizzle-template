import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: UsersService;

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const hashedPassword = '$2b$10$abcdefghijklmnopqrstuvwxyz';
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.email).toBe(loginDto.email);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        roleId: mockUser.roleId,
      });
    });

    it('should throw UnauthorizedException for invalid user', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockUsersService.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUsersService.findOne.mockResolvedValue({
        id: 'uuid',
        email: 'test@example.com',
        password: 'hashedpassword',
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockUser = {
        id: 'uuid',
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        isActive: true,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create user successfully', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        name: 'New User',
        password: 'password123',
      };

      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'new-uuid',
        ...registerDto,
        password: 'hashedpassword',
      });

      const bcryptjs = require('bcryptjs');
      jest.spyOn(bcryptjs, 'hashSync').mockReturnValue('hashedpassword');

      const result = await service.register(registerDto);

      expect(result.message).toBe('User created with success');
      expect(result.userId).toBe('new-uuid');
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        name: registerDto.name,
        password: 'hashedpassword',
      });
    });

    it('should throw ConflictException for existing user', async () => {
      const registerDto = {
        email: 'existing@example.com',
        name: 'Existing User',
        password: 'password123',
      };

      mockUsersService.findOne.mockResolvedValue({ id: 'uuid', email: registerDto.email });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });
});
