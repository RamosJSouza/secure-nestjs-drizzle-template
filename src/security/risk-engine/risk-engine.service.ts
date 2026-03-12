import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { and, eq, gte } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { sessions } from '@/database/schema/sessions.schema';
import { auditLogs } from '@/database/schema/audit-logs.schema';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignals {
  /** First login from this device fingerprint for this user */
  newDevice: boolean;
  /** First login from this IP for this user (but device is known) */
  newIp: boolean;
  /** Number of recent failures from this IP across all accounts */
  ipFailureCount: number;
  /** Account was locked due to failures in the last hour */
  accountRecentLockout: boolean;
  /** Refresh token reuse was detected on this account in the last 24 h */
  recentTokenReuse: boolean;
}

export interface RiskAssessment {
  score: number;        
  level: RiskLevel;
  signals: RiskSignals;
}

/**
 * Risk score thresholds:
 *
 *  LOW      (0–29)  : Normal login — proceed.
 *  MEDIUM  (30–59)  : Elevated risk — log security event, proceed.
 *  HIGH    (60–79)  : High risk — log event, proceed (hook here for future MFA step-up).
 *  CRITICAL (80–100): Block login, revoke all user sessions, log event.
 *
 * Score contributions:
 *  New device                : +20
 *  New IP (known device)     : +10
 *  IP failures  5–9          : +10
 *  IP failures 10–14         : +20
 *  IP failures ≥15           : +30
 *  Account locked recently   : +20
 *  Token reuse in last 24 h  : +50  ← single strongest signal
 */
const THRESHOLDS = { medium: 30, high: 60, critical: 80 } as const;

@Injectable()
export class RiskEngineService {
  private readonly logger = new Logger(RiskEngineService.name);

  constructor(
    private readonly dbService: DatabaseService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Assess the risk of a login attempt AFTER password has been successfully verified.
   * All signal queries run in parallel.
   */
  async assessLoginRisk(
    userId: string,
    deviceFingerprint: string,
    ip: string,
  ): Promise<RiskAssessment> {
    const [newDevice, newIp, ipFailureCount, accountRecentLockout, recentTokenReuse] =
      await Promise.all([
        this.isNewDevice(userId, deviceFingerprint),
        this.isNewIp(userId, ip),
        this.getIpFailureCount(ip),
        this.hadRecentLockout(userId),
        this.hadRecentTokenReuse(userId),
      ]);

    let score = 0;
    if (newDevice) score += 20;
    if (newIp && !newDevice) score += 10; // extra IP signal only if device is known
    if (ipFailureCount >= 15) score += 30;
    else if (ipFailureCount >= 10) score += 20;
    else if (ipFailureCount >= 5) score += 10;
    if (accountRecentLockout) score += 20;
    if (recentTokenReuse) score += 50;
    score = Math.min(score, 100);

    const level: RiskLevel =
      score >= THRESHOLDS.critical ? 'critical'
      : score >= THRESHOLDS.high ? 'high'
      : score >= THRESHOLDS.medium ? 'medium'
      : 'low';

    const assessment: RiskAssessment = {
      score,
      level,
      signals: { newDevice, newIp, ipFailureCount, accountRecentLockout, recentTokenReuse },
    };

    if (level !== 'low') {
      this.logger.warn(
        `Risk assessment [${level.toUpperCase()}] score=${score} userId=${userId} ip=${ip} signals=${JSON.stringify(assessment.signals)}`,
      );
    }

    return assessment;
  }

  private async isNewDevice(userId: string, fingerprint: string): Promise<boolean> {
    if (!fingerprint || !userId) return false;
    try {
      const [existing] = await this.dbService.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.deviceFingerprint, fingerprint)))
        .limit(1);
      return !existing;
    } catch {
      return false; // fail open — do not block login on DB error
    }
  }

  private async isNewIp(userId: string, ip: string): Promise<boolean> {
    if (!ip || !userId) return false;
    try {
      const [existing] = await this.dbService.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.ip, ip)))
        .limit(1);
      return !existing;
    } catch {
      return false;
    }
  }

  /** Returns the current per-IP failure counter value from Redis. */
  private async getIpFailureCount(ip: string): Promise<number> {
    if (!ip) return 0;
    try {
      return (await this.cacheManager.get<number>(`sec:fail:ip:${ip}`)) ?? 0;
    } catch {
      return 0;
    }
  }

  /** True if an account-lockout audit event exists for this user within the last hour. */
  private async hadRecentLockout(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const [row] = await this.dbService.db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, userId),
            eq(auditLogs.action, 'auth.account.locked'),
            gte(auditLogs.createdAt, since),
          ),
        )
        .limit(1);
      return !!row;
    } catch {
      return false;
    }
  }

  /** True if a token-reuse audit event exists for this user within the last 24 hours. */
  private async hadRecentTokenReuse(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [row] = await this.dbService.db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorUserId, userId),
            eq(auditLogs.action, 'auth.refresh_token_reuse_detected'),
            gte(auditLogs.createdAt, since),
          ),
        )
        .limit(1);
      return !!row;
    } catch {
      return false;
    }
  }
}
