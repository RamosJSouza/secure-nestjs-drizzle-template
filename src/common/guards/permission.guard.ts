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
import { ConfigService } from '@nestjs/config';
import { RbacService } from '../../modules/rbac/services/rbac.service';

export const PERMISSION_KEY = 'permissions';

/**
 * PermissionGuard — verifica RBAC via DB a cada request (nunca confia no JWT roleId).
 *
 * Comportamento quando @RequirePermissions está ausente:
 *  - PERMISSION_GUARD_STRICT=false (padrão): fail-open → loga WARN e permite.
 *    Útil em dev/staging para detectar rotas não protegidas sem bloquear.
 *  - PERMISSION_GUARD_STRICT=true: fail-closed → lança 403 imediatamente.
 *    Recomendado em produção para garantir que nenhuma rota fique desprotegida.
 *
 * 403 nunca expõe os nomes das permissões requeridas (prevenção de reconhecimento).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) {
      const handler = context.getHandler().name;
      const cls = context.getClass().name;
      const strictMode = this.configService.get<string>('PERMISSION_GUARD_STRICT') === 'true';

      if (strictMode) {
        this.logger.error(
          `PermissionGuard [STRICT] ${cls}.${handler} não tem @RequirePermissions — request bloqueado.`,
        );
        throw new ForbiddenException('Access denied');
      }

      this.logger.warn(
        `PermissionGuard aplicado em ${cls}.${handler} sem @RequirePermissions — ` +
          `rota RBAC-desprotegida. Adicione @RequirePermissions(...) ou defina PERMISSION_GUARD_STRICT=true.`,
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
