import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { OpaqueTokenPurpose, OpaqueTokenStorePort, opaqueTokenKey } from '../ports/opaque-token-store.port';

const CONSUME_SCRIPT = `
  local v = redis.call('GET', KEYS[1])
  if v then redis.call('DEL', KEYS[1]) end
  return v
`;

@Injectable()
export class RedisOpaqueTokenStoreAdapter implements OpaqueTokenStorePort, OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: this.config.get<string>('redis.host', 'localhost'),
      port: this.config.get<number>('redis.port', 6379),
      password: this.config.get<string>('redis.password') || undefined,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async store(purpose: OpaqueTokenPurpose, tokenHash: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.client.set(opaqueTokenKey(purpose, tokenHash), userId, 'EX', ttlSeconds);
  }

  async consume(purpose: OpaqueTokenPurpose, tokenHash: string): Promise<string | null> {
    const result = await this.client.eval(CONSUME_SCRIPT, 1, opaqueTokenKey(purpose, tokenHash));
    return result ? String(result) : null;
  }
}
