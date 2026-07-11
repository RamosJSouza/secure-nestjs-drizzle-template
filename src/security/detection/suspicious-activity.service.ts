import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AuditLogService } from '@/modules/audit/audit-log.service';

/**
 * Thresholds — adjust via environment in a future iteration if needed.
 *
 *  IP_FAIL_THRESHOLD   : Max failed logins from one IP across ANY account
 *                        in the COUNT_WINDOW before the IP is blocked.
 *
 *  IP_BLOCK_DURATION   : How long a blocked IP is refused at login.
 *
 *  COUNT_WINDOW        : Sliding window (seconds) for failure counters.
 *                        Counters reset after this TTL naturally.
 */
const IP_FAIL_THRESHOLD = 20;
const IP_BLOCK_DURATION_S = 15 * 60; // 15 minutes
const COUNT_WINDOW_S = 60 * 60; // 1 hour sliding window

/**
 * Detects and blocks credential stuffing and distributed brute-force attacks.
 *
 * DISTINCT FROM per-account lockout (in UsersService):
 *   Per-account lockout catches targeted attacks on a single user.
 *   This service catches CROSS-ACCOUNT attacks from one IP — the pattern
 *   of credential stuffing, where each account receives only 1-2 attempts.
 *
 * Implementation:
 *   - Uses Redis counters (`sec:fail:ip:{ip}`) with TTL = COUNT_WINDOW_S.
 *   - Counter incremented on every failed login, regardless of which account.
 *   - If counter >= IP_FAIL_THRESHOLD → IP is added to blocklist for IP_BLOCK_DURATION_S.
 *   - Blocklist key: `sec:block:ip:{ip}`.
 *   - Fails OPEN if Redis is unavailable to prevent API outage.
 */
@Injectable()
export class SuspiciousActivityService {
  private readonly logger = new Logger(SuspiciousActivityService.name);

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Call at the START of a login request (before credential check).
   * Returns true if the IP is currently on the blocklist.
   */
  async isIpBlocked(ip: string): Promise<boolean> {
    if (!ip) return false;
    try {
      const value = await this.cacheManager.get<string>(this.blockKey(ip));
      return !!value;
    } catch {
      return false; // fail OPEN
    }
  }

  /**
   * Call AFTER a failed login credential check.
   * Increments the IP failure counter and blocks the IP if the threshold is reached.
   *
   * Returns whether the IP was blocked as a result of this call.
   */
  async recordFailedAttempt(ip: string, email: string): Promise<boolean> {
    if (!ip) return false;

    try {
      const failCount = await this.incrementCounter(this.failKey(ip), COUNT_WINDOW_S);

      if (failCount >= IP_FAIL_THRESHOLD) {
        const alreadyBlocked = await this.isIpBlocked(ip);
        if (!alreadyBlocked) {
          await this.blockIp(ip, email, failCount);
          return true;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to record suspicious activity: ${(err as Error).message}`);
    }

    return false;
  }

  /**
   * Manually block an IP (e.g., from an admin action or external threat feed).
   */
  async blockIp(ip: string, _triggerEmail: string, failCount: number): Promise<void> {
    try {
      await this.cacheManager.set(
        this.blockKey(ip),
        '1',
        IP_BLOCK_DURATION_S * 1000, // cache-manager uses ms
      );

      this.logger.warn(`IP ${ip} blocked after ${failCount} failed attempts`);

      await this.auditLogService.log({
        action: 'security.ip.blocked',
        entityType: 'IpAddress',
        metadata: {
          ip,
          failCount,
          blockDurationSeconds: IP_BLOCK_DURATION_S,
          // triggerEmail is intentionally NOT stored here to reduce PII surface —
          // only the count matters for forensics, not which account was targeted last.
        },
      });
    } catch (err) {
      this.logger.error(`Failed to block IP ${ip}: ${(err as Error).message}`);
    }
  }

  /**
   * Atomically increment a Redis counter, setting TTL on first creation.
   * Note: not perfectly atomic (uses get+set), but acceptable for this use case.
   * A race condition here only affects the exact threshold crossing, not security bypass.
   */
  private async incrementCounter(key: string, ttlSeconds: number): Promise<number> {
    try {
      const current = (await this.cacheManager.get<number>(key)) ?? 0;
      const next = current + 1;
      // Always refresh the TTL to maintain a true sliding window
      await this.cacheManager.set(key, next, ttlSeconds * 1000);
      return next;
    } catch {
      return 0; // fail OPEN
    }
  }

  private failKey(ip: string): string {
    return `sec:fail:ip:${ip}`;
  }

  private blockKey(ip: string): string {
    return `sec:block:ip:${ip}`;
  }
}
