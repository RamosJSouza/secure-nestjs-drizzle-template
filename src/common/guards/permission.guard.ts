import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/services/rbac.service';

export const PERMISSION_KEY = 'permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) {
      const handler = context.getHandler().name;
      const cls = context.getClass().name;
      this.logger.warn(
        `PermissionGuard applied to ${cls}.${handler} without @RequirePermissions — ` +
          `route is RBAC-unprotected. Add @RequirePermissions(...) or remove PermissionGuard.`,
      );
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roleId) {
      throw new UnauthorizedException('User does not have a role assigned');
    }

    const hasPermission = await this.rbacService.checkPermissions(
      user.roleId,
      requiredPermissions,
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

export const RequirePermissions = (...permissions: string[]) =>
    SetMetadata(PERMISSION_KEY, permissions);
