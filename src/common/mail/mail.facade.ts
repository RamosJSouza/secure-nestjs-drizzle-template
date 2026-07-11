import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER, IEmailProvider } from './ports/email-provider.port';

@Injectable()
export class MailFacade {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: IEmailProvider,
    private readonly config: ConfigService,
  ) {}

  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    const baseUrl = this.config.get<string>('app.url');
    const ttlSec = this.config.get<number>('tokens.passwordResetTtlSeconds', 900);
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailProvider.sendMail(to, 'Password reset', 'password-reset', {
      resetUrl,
      expiresMinutes: Math.floor(ttlSec / 60),
    });
  }

  async sendEmailVerification(to: string, rawToken: string): Promise<void> {
    const baseUrl = this.config.get<string>('app.url');
    const ttlSec = this.config.get<number>('tokens.emailVerificationTtlSeconds', 86400);
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await this.emailProvider.sendMail(to, 'Verify your email', 'email-verification', {
      verifyUrl,
      expiresHours: Math.floor(ttlSec / 3600),
    });
  }
}
