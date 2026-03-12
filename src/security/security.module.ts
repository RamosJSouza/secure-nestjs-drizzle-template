import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TokenRevocationService } from './token-revocation/token-revocation.service';
import { SuspiciousActivityService } from './detection/suspicious-activity.service';
import { RiskEngineService } from './risk-engine/risk-engine.service';

/**
 * SecurityModule is @Global — TokenRevocationService, SuspiciousActivityService,
 * and RiskEngineService are available to any module via DI without explicit imports.
 * CacheModule provides CACHE_MANAGER for all three services.
 *
 * Must be imported in AppModule before AuthModule.
 */
@Global()
@Module({
  imports: [CacheModule.register()],
  providers: [TokenRevocationService, SuspiciousActivityService, RiskEngineService],
  exports: [TokenRevocationService, SuspiciousActivityService, RiskEngineService],
})
export class SecurityModule {}
