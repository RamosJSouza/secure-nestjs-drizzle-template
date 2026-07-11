import { Injectable } from '@nestjs/common';
import { OpaqueTokenPurpose, OpaqueTokenStorePort, opaqueTokenKey } from '../ports/opaque-token-store.port';

@Injectable()
export class InMemoryOpaqueTokenStoreAdapter implements OpaqueTokenStorePort {
  private readonly entries = new Map<string, { userId: string; expiresAt: number }>();

  async store(purpose: OpaqueTokenPurpose, tokenHash: string, userId: string, ttlSeconds: number): Promise<void> {
    this.entries.set(opaqueTokenKey(purpose, tokenHash), {
      userId,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async consume(purpose: OpaqueTokenPurpose, tokenHash: string): Promise<string | null> {
    const k = opaqueTokenKey(purpose, tokenHash);
    const entry = this.entries.get(k);
    if (!entry) return null;
    this.entries.delete(k);
    if (entry.expiresAt < Date.now()) return null;
    return entry.userId;
  }
}
