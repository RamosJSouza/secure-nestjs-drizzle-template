import { Module } from '@nestjs/common';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { WebhookEndpointsService } from './webhook-endpoints.service';

@Module({
  controllers: [WebhookEndpointsController],
  providers: [WebhookEndpointsService],
  exports: [WebhookEndpointsService],
})
export class WebhookEndpointsModule {}
