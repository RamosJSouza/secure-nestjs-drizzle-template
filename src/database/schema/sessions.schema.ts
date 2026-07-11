import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { organizations } from './organizations.schema';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),

    // JTIs for Redis revocation on logout, password change, or soft-delete.
    accessTokenJti: text('access_token_jti'),
    refreshTokenJti: text('refresh_token_jti'),

    // Tenant the session belongs to. Copied from the user at session creation
    // so RLS / app-level scoping can isolate sessions by organization.
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),

    // Opaque fingerprint derived from User-Agent + IP hash.
    // Used to detect sessions being used from a different device/IP.
    deviceFingerprint: varchar('device_fingerprint', { length: 64 }),

    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    rotatedFromSessionId: uuid('rotated_from_session_id'),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_refresh_token_hash_idx').on(table.refreshTokenHash),
    index('sessions_rotated_from_session_id_idx').on(table.rotatedFromSessionId),
    index('sessions_access_token_jti_idx').on(table.accessTokenJti),
    index('sessions_refresh_token_jti_idx').on(table.refreshTokenJti),
    index('sessions_user_id_revoked_at_idx').on(table.userId, table.revokedAt),
    index('sessions_organization_id_idx').on(table.organizationId),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
