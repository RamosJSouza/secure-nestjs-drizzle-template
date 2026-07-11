import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmailVerificationGuard } from './email-verification.guard';
import { REQUIRE_EMAIL_VERIFICATION_KEY } from '../decorators/require-email-verification.decorator';

describe('EmailVerificationGuard', () => {
  const reflector = new Reflector();
  const guard = new EmailVerificationGuard(reflector);

  const ctx = (user: object | undefined, required = true): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_EMAIL_VERIFICATION_KEY) return true;
      return false;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows when emailVerifiedAt is set', () => {
    expect(guard.canActivate(ctx({ emailVerifiedAt: new Date() }))).toBe(true);
  });

  it('throws 403 when emailVerifiedAt is missing', () => {
    expect(() => guard.canActivate(ctx({ id: 'u1' }))).toThrow(ForbiddenException);
  });

  it('passes through when decorator absent', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });
});
