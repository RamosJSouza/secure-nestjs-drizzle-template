import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { compare as bcryptCompare } from 'bcryptjs';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { DatabaseService } from '@/database/database.service';
import { sessions, Session } from '@/database/schema/sessions.schema';
import { users, User } from '@/database/schema/users.schema';
import { AuditLogService } from '@/modules/audit/audit-log.service';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private auditLogService: AuditLogService,
    private dbService: DatabaseService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Verify a password against its stored hash.
   * Supports both Argon2id (new) and bcrypt (legacy migration path).
   * If the stored hash is bcrypt, returns the plaintext so the caller can
   * transparently re-hash it with Argon2id.
   */
  private async verifyPassword(
    plaintext: string,
    stored: string,
  ): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (stored.startsWith('$argon2')) {
      const valid = await argon2.verify(stored, plaintext);
      return { valid, needsRehash: false };
    }
    const valid = await bcryptCompare(plaintext, stored);
    return { valid, needsRehash: valid }; 
  }

  private async revokeSessionFamilyAndLogReuse(
    reusedSession: Session,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const userId = reusedSession.userId;
    const sessionFamilyIds = await this.getSessionFamilyIds(reusedSession);

    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, userId));

    this.logger.warn(
      `Refresh token reuse detected for user ${userId}. Revoked ${sessionFamilyIds.length} sessions.`,
    );

    await this.auditLogService.log({
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'Session',
      entityId: reusedSession.id,
      actorUserId: userId,
      metadata: { sessionFamilyIds },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }

  private async getSessionFamilyIds(session: Session): Promise<string[]> {
    const ids: string[] = [session.id];
    const visited = new Set<string>([session.id]);

    let currentId: string | null = session.rotatedFromSessionId;
    while (currentId) {
      const [parent] = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, currentId))
        .limit(1);
      if (!parent || visited.has(parent.id)) break;
      ids.push(parent.id);
      visited.add(parent.id);
      currentId = parent.rotatedFromSessionId;
    }

    let toVisit = [...ids];
    while (toVisit.length > 0) {
      const children = await this.db
        .select()
        .from(sessions)
        .where(inArray(sessions.rotatedFromSessionId, toVisit));
      toVisit = [];
      for (const c of children) {
        if (!visited.has(c.id)) {
          visited.add(c.id);
          ids.push(c.id);
          toVisit.push(c.id);
        }
      }
    }

    return ids;
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    try {
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const user = await this.usersService.findOne(dto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { valid, needsRehash } = await this.verifyPassword(dto.password, user.password);

    if (!valid) {
      const result = await this.usersService.recordFailedLogin(user.id);
      if (result.lockedUntil) {
        await this.auditLogService.log({
          action: 'auth.account.locked',
          entityType: 'User',
          entityId: user.id,
          actorUserId: null,
          metadata: { failedAttempts: result.failedLoginAttempts },
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.resetFailedLogin(user.id);

    if (needsRehash) {
      argon2
        .hash(dto.password, ARGON2_OPTIONS)
        .then((newHash) => this.usersService.updatePassword(user.id, newHash))
        .catch((err: Error) =>
          this.logger.warn(`Argon2 rehash failed for user ${user.id}: ${err.message}`),
        );
    }

    return this.createTokensAndSession(user, ip, userAgent);
  }

  async refresh(
    dto: RefreshDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const token = dto.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: { sub: string; email: string; roleId?: string; exp: number };
    try {
      payload = this.jwtService.verify(token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashRefreshToken(token);

    const [sessionWithUser] = await this.db.query.sessions.findMany({
      with: { user: true },
      where: eq(sessions.refreshTokenHash, tokenHash),
      limit: 1,
    });

    if (!sessionWithUser) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!this.constantTimeCompare(tokenHash, sessionWithUser.refreshTokenHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();
    if (sessionWithUser.revokedAt) {
      await this.revokeSessionFamilyAndLogReuse(sessionWithUser, ip, userAgent);
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions have been revoked.',
      );
    }

    if (sessionWithUser.expiresAt < now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = sessionWithUser.user;
    if (!user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.rotateSession(sessionWithUser, user, ip, userAgent);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.refreshTokenHash, tokenHash),
          isNull(sessions.revokedAt),
        ),
      );
  }

  private async createTokensAndSession(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const tokenPayload = { sub: user.id, email: user.email, roleId: user.roleId };

    const accessToken = this.jwtService.sign(tokenPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRES,
      algorithm: 'RS256',
    });

    const refreshToken = this.jwtService.sign(tokenPayload, {
      expiresIn: REFRESH_TOKEN_EXPIRES,
      algorithm: 'RS256',
    });

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    });

    return {
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async rotateSession(
    oldSession: Session,
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, oldSession.id));

    const tokenPayload = { sub: user.id, email: user.email, roleId: user.roleId };

    const accessToken = this.jwtService.sign(tokenPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRES,
      algorithm: 'RS256',
    });

    const refreshToken = this.jwtService.sign(tokenPayload, {
      expiresIn: REFRESH_TOKEN_EXPIRES,
      algorithm: 'RS256',
    });

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      rotatedFromSessionId: oldSession.id,
    });

    return {
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findOne(dto.email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
    });

    return { message: 'User created with success', userId: user.id };
  }

  async changePassword(
    userId: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ userId: string }> {
    const hashedPassword = await argon2.hash(newPassword, ARGON2_OPTIONS);
    await this.usersService.updatePassword(userId, hashedPassword);

    const revokedAt = new Date();
    const result = await this.db
      .update(sessions)
      .set({ revokedAt })
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
      )
      .returning({ id: sessions.id });

    this.logger.log(
      `Password changed for user ${userId}. Revoked ${result.length} active sessions.`,
    );

    return { userId };
  }
}
