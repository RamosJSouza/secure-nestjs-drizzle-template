import { ConflictException } from '@nestjs/common';

/**
 * Maps PostgreSQL constraint-violation error codes to NestJS HTTP exceptions.
 * Centralizes the duplicated `if (err.code === '23505'/'23503')` catch blocks
 * found across RBAC services.
 *
 * - 23505 (unique_violation): duplicate key → 409 Conflict
 * - 23503 (foreign_key_violation): referenced row prevents delete → 409 Conflict
 *
 * Any other error is rethrown unchanged. The function never returns (it always
 * throws), so callers can use it as the sole statement in a `catch` block.
 */
export function mapPostgresError(err: unknown, conflictMessage: string): never {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === '23505' || code === '23503') {
      throw new ConflictException(conflictMessage);
    }
  }
  throw err;
}
