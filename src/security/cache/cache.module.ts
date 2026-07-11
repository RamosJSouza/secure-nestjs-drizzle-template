import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const ttl = config.get<number>('RBAC_CACHE_TTL', 300_000);
        const redisDisabled = config.get<string>('DISABLE_REDIS') === 'true';

        if (redisDisabled) {
          return { ttl, max: 1000 };
        }

        return {
          store: await redisStore({
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            ttl,
          }),
          ttl,
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
