import { Module } from '@nestjs/common';
import { EmailVerificationGuard } from './guards/email-verification.guard';
import { GracePeriodGuard } from './guards/grace-period.guard';

@Module({
  providers: [EmailVerificationGuard, GracePeriodGuard],
  exports: [EmailVerificationGuard, GracePeriodGuard],
})
export class AuthGuardsModule {}
