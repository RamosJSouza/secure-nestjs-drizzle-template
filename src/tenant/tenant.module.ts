import { Global, Module } from '@nestjs/common';
import { TenantDatabaseService } from './tenant-database.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenantDatabaseService, TenantGuard],
  exports: [TenantDatabaseService, TenantGuard],
})
export class TenantModule {}
