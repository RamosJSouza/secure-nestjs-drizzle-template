import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { FeatureService } from './services/feature.service';
import { PermissionService } from './services/permission.service';
import { RoleService } from './services/role.service';
import { RbacService } from './services/rbac.service';
import { FeatureController } from './controllers/feature.controller';
import { PermissionController } from './controllers/permission.controller';
import { RoleController } from './controllers/role.controller';

@Global()
@Module({
  imports: [
    CacheModule.register({
      ttl: 300000,
      max: 1000,
    }),
  ],
  controllers: [FeatureController, PermissionController, RoleController],
  providers: [FeatureService, PermissionService, RoleService, RbacService],
  exports: [RbacService],
})
export class RbacModule {}
