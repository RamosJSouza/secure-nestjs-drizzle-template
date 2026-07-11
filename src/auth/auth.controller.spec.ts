import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { EmailVerificationService } from './services/email-verification.service';
import { JwtAuthGuard } from './strategy/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    changePassword: jest.fn(),
    logout: jest.fn(),
  };

  const mockPasswordRecoveryService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockEmailVerificationService = {
    sendVerification: jest.fn(),
    verifyEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: PasswordRecoveryService, useValue: mockPasswordRecoveryService },
        { provide: EmailVerificationService, useValue: mockEmailVerificationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call authService.login and return result', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const authResponse = {
        email: 'test@example.com',
        access_token: 'mock-jwt-token',
      };

      mockAuthService.login.mockResolvedValue(authResponse);

      const client = { ip: '127.0.0.1', userAgent: 'test-agent' };
      const result = await controller.login(loginDto, client as any);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'test-agent');
      expect(result).toEqual(authResponse);
    });
  });

  describe('register', () => {
    it('should call authService.register and return result', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        name: 'New User',
        password: 'password123',
      };

      const authResponse = {
        message: 'User created with success',
      };

      mockAuthService.register.mockResolvedValue(authResponse);

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(authResponse);
    });
  });

  describe('refresh', () => {
    it('should call authService.refresh and return result', async () => {
      const refreshDto = { refresh_token: 'rt' };
      const client = { ip: '127.0.0.1', userAgent: 'test-agent' };
      mockAuthService.refresh.mockResolvedValue({ access_token: 'a', refresh_token: 'r' });
      const result = await controller.refresh(refreshDto, client as any);
      expect(mockAuthService.refresh).toHaveBeenCalledWith(refreshDto, '127.0.0.1', 'test-agent');
      expect(result).toEqual({ access_token: 'a', refresh_token: 'r' });
    });
  });

  describe('logout', () => {
    it('should call authService.logout with userId and refresh_token', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      await controller.logout({ refresh_token: 'rt' }, 'u1' as any);
      expect(mockAuthService.logout).toHaveBeenCalledWith('u1', 'rt');
    });
  });

  describe('changePassword', () => {
    it('passes userId, ip and userAgent to authService.changePassword', async () => {
      mockAuthService.changePassword.mockResolvedValue({ userId: 'u1' });
      const dto = { currentPassword: 'old', newPassword: 'NewPass123!' };
      const client = { ip: '1.2.3.4', userAgent: 'agent' };
      await controller.changePassword(dto, 'u1' as any, client as any);
      expect(mockAuthService.changePassword).toHaveBeenCalledWith('u1', dto.currentPassword, dto.newPassword, '1.2.3.4', 'agent');
    });
  });
});
