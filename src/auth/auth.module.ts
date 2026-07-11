import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '@/users/users.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AuthController } from './auth.controller';

// SecurityModule is @Global — TokenRevocationService and SuspiciousActivityService
// are available here via DI without explicit import.

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
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
  controllers: [AuthController],
})
export class AuthModule {}
