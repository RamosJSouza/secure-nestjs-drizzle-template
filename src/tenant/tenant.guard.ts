import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '@/logger/request-context';
import { REQUIRE_TENANT_KEY } from './require-tenant.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const organizationId = RequestContext.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException(
        'Tenant context required. Ensure your account is linked to an organization.',
      );
    }

    return true;
  }
}
