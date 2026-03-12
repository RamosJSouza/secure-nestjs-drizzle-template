import {
  Injectable,
  Logger,
  BeforeApplicationShutdown,
  OnApplicationShutdown,
} from '@nestjs/common';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Graceful shutdown: stop accepting requests, close DB, enforce 10s timeout.
 * - HTTP server stops accepting via Nest lifecycle
 * - DB pool is closed by DatabaseService.onModuleDestroy()
 */
@Injectable()
export class GracefulShutdownService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(GracefulShutdownService.name);
  private forceExitTimer: ReturnType<typeof setTimeout> | null = null;

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal received: ${signal ?? 'unknown'}`);

    this.forceExitTimer = setTimeout(() => {
      this.logger.error(`Shutdown timeout (${SHUTDOWN_TIMEOUT_MS}ms) - forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.forceExitTimer) {
      clearTimeout(this.forceExitTimer);
      this.forceExitTimer = null;
    }
    this.logger.log('Graceful shutdown complete');
  }
}
