import { Injectable, UnauthorizedException, ConflictException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { compare as bcryptCompare } from 'bcryptjs';
import { UsersService } from '@/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { DatabaseService } from '@/database/database.service';
import { sessions, Session } from '@/database/schema/sessions.schema';
import { User } from '@/database/schema/users.schema';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { SuspiciousActivityService } from '@/security/detection/suspicious-activity.service';
import { RiskEngineService } from '@/security/risk-engine/risk-engine.service';
import { SecurityEventService } from '@/security/events/security-event.service';
import { TOKEN_TYPE, TOKEN_ISSUER, TOKEN_AUDIENCE } from './token-types';
import { ARGON2_OPTIONS } from './constants/password.constants';
import { SESSION_CREDENTIAL_FIELDS } from './constants/session.constants';
import { revokeAllActiveUserSessions } from './utils/revoke-user-sessions';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';

const MAX_SESSIONS_PER_USER = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private auditLogService: AuditLogService,
    private dbService: DatabaseService,
    private tokenRevocationService: TokenRevocationService,
    private suspiciousActivityService: SuspiciousActivityService,
    private riskEngineService: RiskEngineService,
    private securityEventService: SecurityEventService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  private async verifyPassword(plaintext: string, stored: string): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (stored.startsWith('$argon2')) {
      const valid = await argon2.verify(stored, plaintext);
      return { valid, needsRehash: false };
    }
    const valid = await bcryptCompare(plaintext, stored);
    return { valid, needsRehash: valid };
  }

  private deviceFingerprint(userAgent: string | undefined, ip: string | undefined): string {
    return createHash('sha256')
      .update(`${userAgent ?? ''}|${ip ?? ''}`)
      .digest('hex');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async getSessionFamilyIds(session: Session): Promise<string[]> {
    const ids: string[] = [session.id];
    const visited = new Set<string>([session.id]);

    let currentId: string | null = session.rotatedFromSessionId;
    while (currentId) {
      const [parent] = await this.db.select().from(sessions).where(eq(sessions.id, currentId)).limit(1);
      if (!parent || visited.has(parent.id)) break;
      ids.push(parent.id);
      visited.add(parent.id);
      currentId = parent.rotatedFromSessionId;
    }

    let toVisit = [...ids];
    while (toVisit.length > 0) {
      const children = await this.db.select().from(sessions).where(inArray(sessions.rotatedFromSessionId, toVisit));
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

  private async revokeSessionCredentials(
    jtis: { accessTokenJti: string | null; refreshTokenJti: string | null }[],
    failClosed = false,
  ): Promise<void> {
    await this.tokenRevocationService.revokeSessionJtis(jtis, failClosed);
  }

  private async revokeSessionFamilyAndLogReuse(reusedSession: Session, ip?: string, userAgent?: string): Promise<void> {
    const userId = reusedSession.userId;
    const sessionFamilyIds = await this.getSessionFamilyIds(reusedSession);

    const revokedSessions = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning(SESSION_CREDENTIAL_FIELDS);

    await this.revokeSessionCredentials(revokedSessions).catch((err: Error) =>
      this.logger.error(`JTI revocation failed during reuse cleanup: ${err.message}`),
    );

    this.logger.warn(`Refresh token reuse detected for user ${userId}. Revoked ${revokedSessions.length} sessions.`);

    await this.auditLogService.log({
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'Session',
      entityId: reusedSession.id,
      actorUserId: userId,
      metadata: { sessionFamilyIds, revokedCount: revokedSessions.length },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }

  private async enforceSessionLimit(userId: string, ip?: string): Promise<void> {
    const activeSessions = await this.db
      .select(SESSION_CREDENTIAL_FIELDS)
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(asc(sessions.createdAt));

    if (activeSessions.length < MAX_SESSIONS_PER_USER) return;

    const toEvict = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER + 1);
    const idsToEvict = toEvict.map((s) => s.id);

    await this.db.update(sessions).set({ revokedAt: new Date() }).where(inArray(sessions.id, idsToEvict));

    await this.revokeSessionCredentials(toEvict).catch(() => undefined);

    this.logger.log(`Evicted ${toEvict.length} oldest sessions for user ${userId} (limit: ${MAX_SESSIONS_PER_USER})`);

    this.securityEventService.sessionLimitEviction({ userId, evictedCount: toEvict.length, ip }).catch(() => undefined);
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<{ email: string; access_token: string; refresh_token: string }> {
    if (ip && (await this.suspiciousActivityService.isIpBlocked(ip))) {
      throw new HttpException('Too many failed attempts from this IP. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.usersService.findOne(dto.email);

    if (!user || !user.isActive) {
      if (ip) {
        await this.suspiciousActivityService.recordFailedAttempt(ip, dto.email);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { valid, needsRehash } = await this.verifyPassword(dto.password, user.password);

    if (!valid) {
      const [failResult] = await Promise.all([
        this.usersService.recordFailedLogin(user.id),
        ip ? this.suspiciousActivityService.recordFailedAttempt(ip, dto.email) : Promise.resolve(false),
      ]);

      if (failResult.lockedUntil) {
        await this.auditLogService.log({
          action: 'auth.account.locked',
          entityType: 'User',
          entityId: user.id,
          actorUserId: null,
          metadata: { failedAttempts: failResult.failedLoginAttempts },
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
        .catch((err: Error) => this.logger.warn(`Argon2 rehash failed for user ${user.id}: ${err.message}`));
    }

    const fingerprint = this.deviceFingerprint(userAgent, ip);
    const risk = await this.riskEngineService.assessLoginRisk(user.id, fingerprint, ip ?? '');

    if (risk.level === 'critical') {
      const activeSessions = await this.db
        .select(SESSION_CREDENTIAL_FIELDS)
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));

      await this.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await this.revokeSessionCredentials(activeSessions).catch(() => undefined);
      await this.auditLogService.log({
        action: 'security.risk.login_blocked',
        entityType: 'User',
        entityId: user.id,
        metadata: { riskScore: risk.score, signals: risk.signals },
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
      });
      throw new HttpException('Login blocked due to suspicious activity. All sessions have been revoked.', HttpStatus.FORBIDDEN);
    }

    if (risk.level !== 'low') {
      await this.auditLogService.log({
        action: 'security.risk.elevated_login',
        entityType: 'User',
        entityId: user.id,
        metadata: { riskScore: risk.score, riskLevel: risk.level, signals: risk.signals },
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
      });
    }

    return this.createTokensAndSession(user, ip, userAgent);
  }

  async refresh(dto: RefreshDto, ip?: string, userAgent?: string): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const token = dto.refresh_token;

    let payload: { sub: string; jti: string; typ: string; exp: number };
    try {
      payload = this.jwtService.verify(token, {
        algorithms: ['RS256'],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== TOKEN_TYPE.REFRESH) {
      throw new UnauthorizedException('Invalid token type');
    }

    const now = new Date();
    const tokenHash = this.hashRefreshToken(token);

    const [claimed] = await this.db
      .update(sessions)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)))
      .returning();

    if (!claimed) {
      const [existing] = await this.db.select().from(sessions).where(eq(sessions.refreshTokenHash, tokenHash)).limit(1);

      if (existing?.revokedAt) {
        await this.revokeSessionFamilyAndLogReuse(existing, ip, userAgent);
        throw new UnauthorizedException('Refresh token reuse detected. All sessions have been revoked.');
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (claimed.expiresAt < now) throw new UnauthorizedException('Refresh token expired');

    const failClosed = this.tokenRevocationService.isFailClosedEnabled();
    try {
      await this.revokeSessionCredentials(
        [{ accessTokenJti: claimed.accessTokenJti, refreshTokenJti: claimed.refreshTokenJti }],
        failClosed,
      );
    } catch (err) {
      this.logger.error(`JTI revocation failed during refresh for user ${claimed.userId}: ${(err as Error).message}`);
      if (failClosed) {
        try {
          await this.db.update(sessions).set({ revokedAt: null }).where(eq(sessions.id, claimed.id));
        } catch (revertErr) {
          this.logger.error(`Failed to revert session claim: ${(revertErr as Error).message}`);
        }
        throw new HttpException('Unable to complete token rotation. Please retry.', HttpStatus.SERVICE_UNAVAILABLE);
      }
    }

    const user = await this.usersService.findById(claimed.userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');
    if (user.lockedUntil && user.lockedUntil > now) throw new UnauthorizedException('Account is locked.');

    return this.createTokensAndSession(user, ip, userAgent, claimed.id);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);

    const [session] = await this.db
      .select(SESSION_CREDENTIAL_FIELDS)
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);

    if (!session) return;

    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));

    await this.revokeSessionCredentials([session]).catch((err: Error) => this.logger.warn(`JTI revocation failed on logout: ${err.message}`));
  }

  private async createTokensAndSession(
    user: Pick<User, 'id' | 'email' | 'organizationId'>,
    ip?: string,
    userAgent?: string,
    rotatedFromSessionId?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    await this.enforceSessionLimit(user.id, ip);

    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const commonSignOptions = {
      algorithm: 'RS256' as const,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    };

    const accessToken = this.jwtService.sign(
      { sub: user.id, jti: accessJti, typ: TOKEN_TYPE.ACCESS },
      { ...commonSignOptions, expiresIn: ACCESS_TOKEN_EXPIRES },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti: refreshJti, typ: TOKEN_TYPE.REFRESH },
      { ...commonSignOptions, expiresIn: REFRESH_TOKEN_EXPIRES },
    );

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      accessTokenJti: accessJti,
      refreshTokenJti: refreshJti,
      organizationId: user.organizationId ?? null,
      deviceFingerprint: this.deviceFingerprint(userAgent, ip),
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      rotatedFromSessionId: rotatedFromSessionId ?? null,
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

  async changePassword(userId: string, currentPassword: string, newPassword: string, ip?: string, userAgent?: string): Promise<{ userId: string }> {
    const user = await this.usersService.findOneByIdForAuth(userId);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const { valid } = await this.verifyPassword(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const hashedPassword = await argon2.hash(newPassword, ARGON2_OPTIONS);
    await this.usersService.updatePassword(userId, hashedPassword);

    const revokedCount = await revokeAllActiveUserSessions(
      this.dbService,
      this.tokenRevocationService,
      userId,
      (err) => this.logger.error(`JTI revocation failed on password change: ${err.message}`),
    );

    this.logger.log(`Password changed for user ${userId}. Revoked ${revokedCount} sessions.`);

    await this.auditLogService.log({
      action: 'auth.password.changed',
      entityType: 'User',
      entityId: userId,
      actorUserId: userId,
      metadata: { revokedSessions: revokedCount },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return { userId };
  }
}
