import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TokenRevocationService } from './token-revocation/token-revocation.service';
import { SuspiciousActivityService } from './detection/suspicious-activity.service';
import { RiskEngineService } from './risk-engine/risk-engine.service';
import { SecurityEventService } from './events/security-event.service';

/**
 * SecurityModule is @Global — TokenRevocationService, SuspiciousActivityService,
 * RiskEngineService, and SecurityEventService are available to any module via DI
 * without explicit imports. CacheModule provides CACHE_MANAGER for all services.
 *
 * Must be imported in AppModule before AuthModule.
 */
@Global()
@Module({
  imports: [CacheModule.register()],
  providers: [TokenRevocationService, SuspiciousActivityService, RiskEngineService, SecurityEventService],
  exports: [TokenRevocationService, SuspiciousActivityService, RiskEngineService, SecurityEventService],
})
export class SecurityModule {}
