import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;
  public db: NodePgDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const ssl = this.configService.get<string>('DB_SSL') === 'true';
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST'),
      port: this.configService.get<number>('DB_PORT') ?? 5432,
      user: this.configService.get<string>('DB_USERNAME'),
      password: this.configService.get<string>('DB_PASSWORD'),
      database: this.configService.get<string>('DB_DATABASE'),
      max: this.configService.get<number>('DB_POOL_MAX') ?? 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    });

    this.db = drizzle(this.pool, { schema });
    this.logger.log('Database connection pool initialized');
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('Database connection pool closed');
  }
}
