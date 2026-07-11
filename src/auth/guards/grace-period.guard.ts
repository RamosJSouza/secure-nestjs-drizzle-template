import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GracePeriodGuard implements CanActivate {
  private readonly logger = new Logger(GracePeriodGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!user?.passwordChangedAt) return true;

    const graceHours = this.config.get<number>('security.passwordChangeGracePeriodHours', 24);
    const graceMs = graceHours * 60 * 60 * 1000;
    const changedAt = new Date(user.passwordChangedAt).getTime();
    const elapsed = Date.now() - changedAt;

    if (elapsed < graceMs) {
      const retryAfterHours = Math.ceil((graceMs - elapsed) / (60 * 60 * 1000));
      this.logger.warn(`Grace period blocked action for userId=${user.id}`);
      throw new ForbiddenException(
        `This action is temporarily unavailable for ${retryAfterHours} hour(s) after a password change.`,
      );
    }
    return true;
  }
}
