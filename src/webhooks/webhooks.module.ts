import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEndpointsModule } from './webhook-endpoints.module';
import { WebhookProducer } from './webhook.producer';
import { WebhookProcessor } from './webhook.processor';
import { WEBHOOK_QUEUE } from './webhooks.constants';

/**
 * Full webhooks module: CRUD + async delivery via BullMQ.
 * Requires Redis. Import conditionally in AppModule when DISABLE_REDIS !== 'true'.
 */
@Module({
  imports: [
    WebhookEndpointsModule,
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  providers: [WebhookProducer, WebhookProcessor],
})
export class WebhooksModule {}
