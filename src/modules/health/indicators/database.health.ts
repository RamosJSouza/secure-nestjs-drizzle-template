import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { DatabaseService } from '@/database/database.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseService: DatabaseService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
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
