import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { features } from './features.schema';

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('permissions_feature_id_action_unique').on(table.featureId, table.action),
    index('permissions_feature_id_action_idx').on(table.featureId, table.action),
    index('permissions_action_idx').on(table.action),
  ],
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
