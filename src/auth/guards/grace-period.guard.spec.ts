import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GracePeriodGuard } from './grace-period.guard';

describe('GracePeriodGuard', () => {
  const config = {
    get: jest.fn().mockReturnValue(24),
  } as unknown as ConfigService;
  const guard = new GracePeriodGuard(config);

  const ctx = (user: object | undefined): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows when password changed more than 24h ago', () => {
    const changed = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(guard.canActivate(ctx({ id: 'u1', passwordChangedAt: changed }))).toBe(true);
  });

  it('blocks when password changed within grace period', () => {
    const changed = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(() => guard.canActivate(ctx({ id: 'u1', passwordChangedAt: changed }))).toThrow(ForbiddenException);
  });

  it('allows when passwordChangedAt is absent', () => {
    expect(guard.canActivate(ctx({ id: 'u1' }))).toBe(true);
  });
});
