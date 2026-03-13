import { pgTable, uuid, text, integer, timestamp, index, varchar } from 'drizzle-orm/pg-core';
import { webhookEndpoints } from './webhook-endpoints.schema';

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull(),
    event: varchar('event', { length: 128 }).notNull(),
    payload: text('payload').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at'),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_id_idx').on(table.endpointId),
    index('webhook_deliveries_org_status_idx').on(table.organizationId, table.status),
    index('webhook_deliveries_next_attempt_idx').on(table.nextAttemptAt),
  ],
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
