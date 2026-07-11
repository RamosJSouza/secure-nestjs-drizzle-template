import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { sessions } from '@/database/schema/sessions.schema';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { SESSION_CREDENTIAL_FIELDS } from '../constants/session.constants';

export async function revokeAllActiveUserSessions(
  dbService: DatabaseService,
  tokenRevocationService: TokenRevocationService,
  userId: string,
  onJtiError?: (error: Error) => void,
): Promise<number> {
  const revoked = await dbService.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning(SESSION_CREDENTIAL_FIELDS);

  try {
    await tokenRevocationService.revokeSessionJtis(
      revoked,
      tokenRevocationService.isFailClosedEnabled(),
    );
  } catch (err) {
    if (onJtiError) {
      onJtiError(err as Error);
    } else {
      throw err;
    }
  }

  return revoked.length;
}
