import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { UsersService } from '@/users/users.service';
import { DatabaseService } from '@/database/database.service';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { MailFacade } from '@/common/mail/mail.facade';
import {
  hashOpaqueToken,
  OPAQUE_TOKEN_STORE,
  OpaqueTokenPurpose,
  OpaqueTokenStorePort,
} from '../ports/opaque-token-store.port';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ARGON2_OPTIONS } from '../constants/password.constants';
import { revokeAllActiveUserSessions } from '../utils/revoke-user-sessions';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly dbService: DatabaseService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly mailFacade: MailFacade,
    private readonly config: ConfigService,
    @Inject(OPAQUE_TOKEN_STORE) private readonly tokenStore: OpaqueTokenStorePort,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const user = await this.usersService.findOne(dto.email);

      if (!user || !user.isActive) {
        await argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);
        return;
      }

      const rawToken = randomBytes(32).toString('hex');
      const ttl = this.config.get<number>('tokens.passwordResetTtlSeconds', 900);

      await this.tokenStore.store(
        OpaqueTokenPurpose.PASSWORD_RESET,
        hashOpaqueToken(rawToken),
        user.id,
        ttl,
      );
      await this.mailFacade.sendPasswordReset(user.email, rawToken);

      this.logger.log(`Password reset requested (userId=${user.id}, ip=${ip})`);
    } finally {
      const minMs = this.config.get<number>('security.forgotPasswordMinResponseMs', 250);
      const elapsed = Date.now() - startedAt;
      if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
      }
    }
  }

  async resetPassword(dto: ResetPasswordDto, ip: string): Promise<{ userId: string }> {
    const userId = await this.tokenStore.consume(
      OpaqueTokenPurpose.PASSWORD_RESET,
      hashOpaqueToken(dto.token),
    );

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    await this.usersService.updatePassword(userId, await argon2.hash(dto.newPassword, ARGON2_OPTIONS));

    const revokedCount = await revokeAllActiveUserSessions(
      this.dbService,
      this.tokenRevocationService,
      userId,
    );

    this.logger.log(`Password reset completed (userId=${userId}, ip=${ip}, revokedSessions=${revokedCount})`);

    return { userId };
  }
}
