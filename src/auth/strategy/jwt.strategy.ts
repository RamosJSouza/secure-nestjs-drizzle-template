import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { RequestContext } from '@/logger/request-context';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { TOKEN_TYPE, TOKEN_ISSUER, TOKEN_AUDIENCE } from '../token-types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private tokenRevocationService: TokenRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('keys.publicKey'),
      algorithms: ['RS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  }

  async validate(payload: { sub: string; jti: string; typ: string }) {
    if (payload.typ !== TOKEN_TYPE.ACCESS) {
      throw new UnauthorizedException('Invalid token type');
    }
    if (!payload.jti) {
      throw new UnauthorizedException('Token missing jti');
    }

    const revoked = await this.tokenRevocationService.isRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    RequestContext.setUser(user.id, user.organizationId ?? undefined);

    return user;
  }
}
