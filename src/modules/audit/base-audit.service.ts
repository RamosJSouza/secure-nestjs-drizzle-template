import { AuditLogService } from './audit-log.service';
import type { AuditLogEntry } from './audit-log.service';

/**
 * Base class for services that perform auditable mutations.
 * Provides AuditLogService for manual audit calls when the interceptor cannot cover the case
 * (e.g. service called from non-HTTP context, or custom metadata needed).
 *
 * Constraint: No mutation allowed without audit.
 * Use @Auditable on controller methods for automatic audit via AuditInterceptor,
 * or call this.auditLog() explicitly when the interceptor path does not apply.
 */
export abstract class BaseAuditService {
  constructor(protected readonly auditLogService: AuditLogService) {}

  protected auditLog(entry: Partial<AuditLogEntry>): Promise<void> {
    return this.auditLogService.log(entry as AuditLogEntry);
  }
}
