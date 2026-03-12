import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import { auditLogs } from '@/database/schema/audit-logs.schema';
import { RequestContext } from '@/logger/request-context';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  organizationId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly dbService: DatabaseService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const correlationId = entry.correlationId ?? RequestContext.getCorrelationId();
      await this.dbService.db.insert(auditLogs).values({
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        actorUserId: entry.actorUserId ?? RequestContext.getUserId() ?? null,
        organizationId: entry.organizationId ?? RequestContext.getOrganizationId() ?? null,
        correlationId: correlationId ?? null,
        metadata: entry.metadata ?? {},
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${entry.action} ${entry.entityType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
