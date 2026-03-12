import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { RequestContext } from '@/logger/request-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('keys.publicKey'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: { sub: string; email: string; roleId?: string }) {
    const user = await this.usersService.findOne(payload.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    RequestContext.setUser(user.id);

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }
}
