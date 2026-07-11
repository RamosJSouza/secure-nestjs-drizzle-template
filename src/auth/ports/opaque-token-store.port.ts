import { createHash } from 'crypto';

export const OPAQUE_TOKEN_STORE = Symbol('OPAQUE_TOKEN_STORE');

export function hashOpaqueToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export enum OpaqueTokenPurpose {
  PASSWORD_RESET = 'password-reset',
  EMAIL_VERIFICATION = 'email-verification',
}

export function opaqueTokenKey(purpose: OpaqueTokenPurpose, tokenHash: string): string {
  return `auth:${purpose}:${tokenHash}`;
}

export interface OpaqueTokenStorePort {
  store(purpose: OpaqueTokenPurpose, tokenHash: string, userId: string, ttlSeconds: number): Promise<void>;
  consume(purpose: OpaqueTokenPurpose, tokenHash: string): Promise<string | null>;
}
