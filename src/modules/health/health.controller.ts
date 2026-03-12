import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckError,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { DatabaseService } from '../../database/database.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseService: DatabaseService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('liveness')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.isDatabaseHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  private async isDatabaseHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.databaseService.ping();
      return indicator.up();
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        indicator.down({
          message: error instanceof Error ? error.message : 'Unknown database error',
        }),
      );
    }
  }
}
