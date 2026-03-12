import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const features = pgTable(
  'features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('features_key_idx').on(table.key),
    index('features_key_is_active_idx').on(table.key, table.isActive),
  ],
);

export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;
