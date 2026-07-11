import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordRecoveryService } from './password-recovery.service';
import { UsersService } from '@/users/users.service';
import { DatabaseService } from '@/database/database.service';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { MailFacade } from '@/common/mail/mail.facade';
import { OPAQUE_TOKEN_STORE } from '../ports/opaque-token-store.port';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('$argon2id$mock'),
}));

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;
  const tokenStore = { store: jest.fn(), consume: jest.fn() };
  const usersService = {
    findOne: jest.fn(),
    findById: jest.fn(),
    updatePassword: jest.fn(),
  };
  const mailFacade = { sendPasswordReset: jest.fn() };
  const tokenRevocationService = {
    revokeSessionJtis: jest.fn(),
    isFailClosedEnabled: jest.fn().mockReturnValue(false),
  };

  const mockReturning = jest.fn().mockResolvedValue([]);
  const mockDb = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning: mockReturning }),
      }),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        { provide: UsersService, useValue: usersService },
        { provide: DatabaseService, useValue: { db: mockDb } },
        { provide: TokenRevocationService, useValue: tokenRevocationService },
        { provide: MailFacade, useValue: mailFacade },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                'tokens.passwordResetTtlSeconds': 900,
                'security.forgotPasswordMinResponseMs': 0,
              };
              return map[key] ?? def;
            }),
          },
        },
        { provide: OPAQUE_TOKEN_STORE, useValue: tokenStore },
      ],
    }).compile();

    service = module.get(PasswordRecoveryService);
  });

  it('forgotPassword does not send email for unknown user', async () => {
    usersService.findOne.mockResolvedValue(undefined);
    await service.forgotPassword({ email: 'x@y.com' }, '1.2.3.4');
    expect(mailFacade.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('resetPassword revokes sessions', async () => {
    tokenStore.consume.mockResolvedValue('user-1');
    usersService.findById.mockResolvedValue({ id: 'user-1', isActive: true });
    mockReturning.mockResolvedValue([{ accessTokenJti: 'a1', refreshTokenJti: 'r1' }]);

    await service.resetPassword(
      { token: 'a'.repeat(64), newPassword: 'NewPass1' },
      '1.2.3.4',
    );

    expect(tokenRevocationService.revokeSessionJtis).toHaveBeenCalled();
    expect(usersService.updatePassword).toHaveBeenCalled();
  });

  it('resetPassword throws for invalid token', async () => {
    tokenStore.consume.mockResolvedValue(null);
    await expect(
      service.resetPassword({ token: 'b'.repeat(64), newPassword: 'NewPass1' }, '1.2.3.4'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
