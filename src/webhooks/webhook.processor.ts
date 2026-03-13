import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { webhookDeliveries } from '@/database/schema/webhook-deliveries.schema';
import { WEBHOOK_QUEUE, WEBHOOK_DELIVER_JOB } from './webhooks.constants';

interface DeliverJobData {
  deliveryId: string;
  endpointUrl: string;
  secret: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly dbService: DatabaseService) {
    super();
  }

  async process(job: Job<DeliverJobData>): Promise<void> {
    if (job.name !== WEBHOOK_DELIVER_JOB) return;

    const { deliveryId, endpointUrl, secret, event, data, timestamp } = job.data;
    const body = JSON.stringify(data);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    let statusCode: number | undefined;
    let responseBody: string | undefined;

    try {
      const response = await axios.post(endpointUrl, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Timestamp': timestamp,
        },
        timeout: 10_000,
      });

      statusCode = response.status;
      responseBody =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

      await this.dbService.db
        .update(webhookDeliveries)
        .set({
          status: 'delivered',
          statusCode,
          responseBody,
          deliveredAt: new Date(),
          attempts: job.attemptsMade + 1,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
    } catch (err: any) {
      statusCode = err?.response?.status;
      responseBody = err?.response?.data
        ? JSON.stringify(err.response.data)
        : (err?.message ?? 'Unknown error');

      await this.dbService.db
        .update(webhookDeliveries)
        .set({ status: 'failed', statusCode, responseBody, attempts: job.attemptsMade + 1 })
        .where(eq(webhookDeliveries.id, deliveryId));

      this.logger.warn(`Webhook delivery ${deliveryId} failed: ${err?.message}`);
      throw err;
    }
  }
}
