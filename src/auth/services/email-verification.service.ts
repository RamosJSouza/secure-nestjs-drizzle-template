import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { UsersService } from '@/users/users.service';
import { MailFacade } from '@/common/mail/mail.facade';
import {
  hashOpaqueToken,
  OPAQUE_TOKEN_STORE,
  OpaqueTokenPurpose,
  OpaqueTokenStorePort,
} from '../ports/opaque-token-store.port';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailFacade: MailFacade,
    private readonly config: ConfigService,
    @Inject(OPAQUE_TOKEN_STORE) private readonly tokenStore: OpaqueTokenStorePort,
  ) {}

  async sendVerification(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user?.isActive || user.emailVerifiedAt) return;

    const rawToken = randomBytes(32).toString('hex');
    const ttl = this.config.get<number>('tokens.emailVerificationTtlSeconds', 86400);

    await this.tokenStore.store(
      OpaqueTokenPurpose.EMAIL_VERIFICATION,
      hashOpaqueToken(rawToken),
      userId,
      ttl,
    );
    await this.mailFacade.sendEmailVerification(user.email, rawToken);

    this.logger.log(`Email verification sent (userId=${userId})`);
  }

  async verifyEmail(rawToken: string): Promise<{ userId: string }> {
    const userId = await this.tokenStore.consume(
      OpaqueTokenPurpose.EMAIL_VERIFICATION,
      hashOpaqueToken(rawToken),
    );

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const user = await this.usersService.findById(userId);
    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.usersService.markEmailVerified(userId);
    this.logger.log(`Email verified (userId=${userId})`);

    return { userId };
  }
}
