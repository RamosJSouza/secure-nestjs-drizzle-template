import { pgTable, uuid, text, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.schema';
import { users } from './users.schema';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    correlationId: uuid('correlation_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_org_created_at_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_actor_created_at_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_entity_type_entity_id_idx').on(table.entityType, table.entityId),
    index('audit_logs_action_created_at_idx').on(table.action, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
