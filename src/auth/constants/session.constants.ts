import { sessions } from '@/database/schema/sessions.schema';

export const SESSION_CREDENTIAL_FIELDS = {
  id: sessions.id,
  accessTokenJti: sessions.accessTokenJti,
  refreshTokenJti: sessions.refreshTokenJti,
};
