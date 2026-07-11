import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

/**
 * Redis-backed JTI revocation list for access tokens.
 *
 * Problem being solved:
 *   JWTs are stateless — once issued, there is no server-side way to
 *   invalidate them before their TTL expires. On logout or password
 *   change, the refresh token session is revoked in the DB, but any
 *   stolen access token remains valid for up to 15 minutes.
 *
 * Solution:
 *   Each access token carries a `jti` (JWT ID) UUID claim. When a
 *   session is terminated, the JTI is written to Redis with a TTL equal
 *   to the remaining access token lifetime. The JWT strategy checks Redis
 *   before authorising each request — O(1) Redis GET per request.
 *
 * Failure mode:
 *   If Redis is unavailable, `isRevoked()` fails OPEN (returns false).
 *   This prevents a Redis outage from taking down the entire API. The
 *   downside is a window where revoked tokens are accepted; this window
 *   is bounded by the 15-minute JWT TTL.
 */
@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);

  // Access token TTL in seconds — must match ACCESS_TOKEN_EXPIRES in auth.service.ts
  static readonly ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fail-closed only when Redis is actually in use. With DISABLE_REDIS=true
   * (default dev), revocation is best-effort (fail-open) to avoid breaking
   * auth flows during local development. In production (Redis available),
   * security-critical paths (refresh rotation, soft-delete) fail closed.
   */
  isFailClosedEnabled(): boolean {
    return this.configService.get<string>('DISABLE_REDIS') !== 'true';
  }

  /**
   * Mark a JTI as revoked. The entry lives in Redis until the original
   * token would have expired anyway — after that the token is invalid
   * due to `exp`, so no further action is needed.
   */
  async revokeToken(jti: string, ttlSeconds: number): Promise<void> {
    const key = this.buildKey(jti);
    try {
      await this.cacheManager.set(key, '1', ttlSeconds * 1000); // cache-manager uses ms
    } catch (err) {
      this.logger.error(`Failed to revoke JTI ${jti}: ${(err as Error).message}`);
      // revocation failure is security-critical; callers decide whether to proceed
      throw err;
    }
  }

  /**
   * Revoke multiple JTIs in parallel. When failClosed is true, throws if any
   * revocation fails (refresh rotation, soft-delete). Otherwise logs and continues.
   */
  async revokeMany(jtis: string[], ttlSeconds: number, failClosed = false): Promise<void> {
    const results = await Promise.allSettled(
      jtis.map((jti) => this.revokeToken(jti, ttlSeconds)),
    );
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.logger.error(`${failures.length}/${jtis.length} JTI revocations failed`);
      if (failClosed) {
        throw new Error(`${failures.length}/${jtis.length} JTI revocations failed (failClosed)`);
      }
    }
  }

  /**
   * Returns true if the JTI is on the revocation list.
   * Fails OPEN on Redis error — see class-level comment for rationale.
   */
  async isRevoked(jti: string): Promise<boolean> {
    const key = this.buildKey(jti);
    try {
      const value = await this.cacheManager.get<string>(key);
      return value !== null && value !== undefined;
    } catch (err) {
      this.logger.warn(
        `JTI revocation check failed (Redis unavailable) — failing OPEN: ${(err as Error).message}`,
      );
      return false; // fail OPEN: prefer availability over strict revocation during Redis outage
    }
  }

  private buildKey(jti: string): string {
    return `revoked:jti:${jti}`;
  }
}
