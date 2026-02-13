import { Module } from '@nestjs/common';
import { GracefulShutdownService } from './graceful-shutdown.service';

@Module({
  providers: [GracefulShutdownService],
})
export class GracefulShutdownModule {}
