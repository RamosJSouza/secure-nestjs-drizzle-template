import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '@/database/database.service';
import * as schema from '@/database/schema';

type Tx = NodePgDatabase<typeof schema>;

@Injectable()
export class TenantDatabaseService {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Execute a Drizzle query block inside a transaction with the PostgreSQL
   * session variable `app.current_tenant` set to `organizationId`.
   *
   * Belt-and-suspenders approach:
   *  1. Service queries always include an explicit `WHERE organization_id = ?`
   *  2. If RLS policies are enabled on the table, Postgres enforces isolation
   *     automatically via `current_setting('app.current_tenant')`.
   *
   * `set_config(name, value, true)` — the third arg means IS_LOCAL = true,
   * so the setting is automatically reverted at transaction end, preventing
   * context bleed between pool connections.
   */
  async withTenant<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${organizationId}, true)`,
      );
      return fn(tx as Tx);
    });
  }

  get db() {
    return this.dbService.db;
  }
}
