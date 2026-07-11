import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '@/users/users.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { MailModule } from '@/common/mail/mail.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AuthController } from './auth.controller';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { EmailVerificationService } from './services/email-verification.service';
import { AuthGuardsModule } from './auth-guards.module';
import { RedisOpaqueTokenStoreAdapter } from './adapters/redis-opaque-token-store.adapter';
import { InMemoryOpaqueTokenStoreAdapter } from './adapters/in-memory-opaque-token-store.adapter';
import { OPAQUE_TOKEN_STORE } from './ports/opaque-token-store.port';

const redisEnabled = process.env.DISABLE_REDIS !== 'true';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', property: 'user', session: false }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        privateKey: configService.get<string>('keys.privateKey'),
        publicKey: configService.get<string>('keys.publicKey'),
        signOptions: { expiresIn: '15m', algorithm: 'RS256' },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuditModule,
    MailModule,
    AuthGuardsModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordRecoveryService,
    EmailVerificationService,
    ...(redisEnabled ? [RedisOpaqueTokenStoreAdapter] : [InMemoryOpaqueTokenStoreAdapter]),
    {
      provide: OPAQUE_TOKEN_STORE,
      useExisting: redisEnabled ? RedisOpaqueTokenStoreAdapter : InMemoryOpaqueTokenStoreAdapter,
    },
  ],
  exports: [AuthService, JwtModule, PassportModule, AuthGuardsModule],
  controllers: [AuthController],
})
export class AuthModule {}
