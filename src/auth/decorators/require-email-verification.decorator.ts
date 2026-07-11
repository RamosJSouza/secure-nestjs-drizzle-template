import { SetMetadata } from '@nestjs/common';

export const REQUIRE_EMAIL_VERIFICATION_KEY = 'requireEmailVerification';
export const RequireEmailVerification = () => SetMetadata(REQUIRE_EMAIL_VERIFICATION_KEY, true);
