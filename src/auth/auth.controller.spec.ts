import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './strategy/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
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

      const mockReq = { ip: '127.0.0.1', socket: {}, get: jest.fn().mockReturnValue('test-agent') } as any;
      const result = await controller.login(loginDto, mockReq);

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
});
