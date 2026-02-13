import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/services/rbac.service';

export const PERMISSION_KEY = 'permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private rbacService: RbacService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
            PERMISSION_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredPermissions) {
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
            throw new ForbiddenException(
                `User does not have required permissions: ${requiredPermissions.join(', ')}`,
            );
        }

        return true;
    }
}

export const RequirePermissions = (...permissions: string[]) =>
    SetMetadata(PERMISSION_KEY, permissions);
