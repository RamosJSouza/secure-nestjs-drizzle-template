import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/strategy/jwt-auth.guard';
import { GracePeriodGuard } from '@/auth/guards/grace-period.guard';
import { EmailVerificationGuard } from '@/auth/guards/email-verification.guard';
import { RequireEmailVerification } from '@/auth/decorators/require-email-verification.decorator';

@Controller('users')
export class UsersController {
  @Post('sensitive-action')
  @UseGuards(JwtAuthGuard, EmailVerificationGuard, GracePeriodGuard)
  @RequireEmailVerification()
  @HttpCode(HttpStatus.OK)
  sensitiveAction() {
    return { status: 'ok', message: 'Sensitive action completed.' };
  }
}
