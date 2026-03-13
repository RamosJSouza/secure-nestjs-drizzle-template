import { SetMetadata } from '@nestjs/common';

export const REQUIRE_TENANT_KEY = 'requireTenant';

export const RequireTenant = () => SetMetadata(REQUIRE_TENANT_KEY, true);
