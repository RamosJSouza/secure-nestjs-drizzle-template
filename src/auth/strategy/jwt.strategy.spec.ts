import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const cfg: any = { get: (_k: string, d?: any) => d ?? 'pubkey' };
  const users: any = { findById: jest.fn() };
  const rev: any = { isRevoked: jest.fn().mockResolvedValue(false) };

  beforeEach(() => {
    jest.clearAllMocks();
    // Instantiate directly: JwtStrategy injects ConfigService/UsersService/
    // TokenRevocationService by CLASS token, so string-token providers in a
    // TestingModule won't resolve. Direct construction avoids DI entirely and
    // is fine for pure unit tests of validate().
    strategy = new JwtStrategy(cfg, users, rev);
  });

  it('rejects a refresh token (typ=refresh) used as access', async () => {
    await expect(
      strategy.validate({ sub: 'u1', jti: 'j1', typ: 'refresh' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('rejects a token missing jti', async () => {
    await expect(
      strategy.validate({ sub: 'u1', typ: 'access' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token missing typ', async () => {
    await expect(
      strategy.validate({ sub: 'u1', jti: 'j1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid access token and returns the user', async () => {
    users.findById.mockResolvedValueOnce({
      id: 'u1',
      isActive: true,
      lockedUntil: null,
      organizationId: null,
    });
    const user = await strategy.validate({ sub: 'u1', jti: 'j1', typ: 'access' });
    expect(user.id).toBe('u1');
    expect(rev.isRevoked).toHaveBeenCalledWith('j1');
  });
});
