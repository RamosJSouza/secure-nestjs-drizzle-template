import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { DatabaseHealthIndicator } from './indicators/database.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('liveness')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.database.isHealthy('database'), () => this.redis.isHealthy('redis')]);
  }
}
