import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { webhookEndpoints } from '@/database/schema/webhook-endpoints.schema';
import { webhookDeliveries } from '@/database/schema/webhook-deliveries.schema';
import { WEBHOOK_QUEUE, WEBHOOK_DELIVER_JOB } from './webhooks.constants';
import { WebhookEventPayload } from './types/webhook-event.types';

@Injectable()
export class WebhookProducer {
  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
    private readonly dbService: DatabaseService,
  ) {}

  @OnEvent('webhook.**')
  async handleWebhookEvent(payload: WebhookEventPayload): Promise<void> {
    const endpoints = await this.dbService.db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.organizationId, payload.organizationId),
          eq(webhookEndpoints.isActive, true),
        ),
      );

    for (const endpoint of endpoints) {
      if (!endpoint.events.includes(payload.event) && !endpoint.events.includes('*')) {
        continue;
      }

      const [delivery] = await this.dbService.db
        .insert(webhookDeliveries)
        .values({
          endpointId: endpoint.id,
          organizationId: payload.organizationId,
          event: payload.event,
          payload: JSON.stringify(payload.data),
          status: 'pending',
        })
        .returning();

      await this.queue.add(WEBHOOK_DELIVER_JOB, {
        deliveryId: delivery.id,
        endpointUrl: endpoint.url,
        secret: endpoint.secret,
        event: payload.event,
        data: payload.data,
        timestamp: payload.timestamp,
      });
    }
  }
}
