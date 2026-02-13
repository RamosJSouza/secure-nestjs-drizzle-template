import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    private readonly configService: ConfigService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicator.check(key);
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT') ?? 6379;

    if (!host) {
      return indicator.up({ message: 'Redis not configured, skipping' });
    }

    let client: RedisClientType | null = null;
    try {
      client = createClient({
        socket: { host, port, connectTimeout: 5000 },
      });
      await client.connect();
      await client.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Redis ping failed',
      });
    } finally {
      if (client?.isOpen) {
        await client.quit();
      }
    }
  }
}
