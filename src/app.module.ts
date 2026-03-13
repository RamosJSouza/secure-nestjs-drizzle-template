import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { GracefulShutdownModule } from './graceful-shutdown/graceful-shutdown.module';
import { LoggerModule } from './logger/logger.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SecurityModule } from './security/security.module';
import { TenantModule } from './tenant/tenant.module';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebhookEndpointsModule } from './webhooks/webhook-endpoints.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import configuration from './config';
import { validationSchema } from './config/validation.schema';

const redisEnabled = process.env.DISABLE_REDIS !== 'true';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 5,
      },
    ]),
    DatabaseModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true }),
    ...(redisEnabled
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
              connection: {
                host: configService.get<string>('redis.host'),
                port: configService.get<number>('redis.port'),
                password: configService.get<string>('redis.password'),
              },
            }),
            inject: [ConfigService],
          }),
          WebhooksModule,
        ]
      : [WebhookEndpointsModule]),
    TenantModule,
    RbacModule,
    OrganizationsModule,
    AuditModule,
    HealthModule,
    GracefulShutdownModule,
    SecurityModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
