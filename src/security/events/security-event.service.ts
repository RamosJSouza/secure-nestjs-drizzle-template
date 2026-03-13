import { Injectable } from '@nestjs/common';
import { AuditLogService } from '@/modules/audit/audit-log.service';

export enum SecurityEventType {
  LOGIN_FAILED                = 'security.login.failed',
  TOKEN_REUSE_DETECTED        = 'auth.refresh_token_reuse_detected',
  SESSION_REVOKED             = 'security.session.revoked',
  SESSION_LIMIT_EVICTION      = 'security.session.limit_eviction',
  ROLE_CHANGED                = 'security.rbac.role_changed',
  PERMISSION_CHANGED          = 'security.rbac.permission_changed',
  IP_BLOCKED                  = 'security.ip.blocked',
  CRITICAL_RISK_LOGIN_BLOCKED = 'security.risk.login_blocked',
}

@Injectable()
export class SecurityEventService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async loginFailed(params: {
    userId?: string;
    email: string;
    ip?: string;
    userAgent?: string;
    reason: string;
  }): Promise<void> {
    await this.auditLogService.log({
      action: SecurityEventType.LOGIN_FAILED,
      entityType: 'User',
      actorUserId: params.userId,
      metadata: { email: params.email, reason: params.reason },
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  async sessionRevoked(params: {
    sessionId: string;
    userId: string;
    ip?: string;
    userAgent?: string;
    reason: string;
  }): Promise<void> {
    await this.auditLogService.log({
      action: SecurityEventType.SESSION_REVOKED,
      entityType: 'Session',
      entityId: params.sessionId,
      actorUserId: params.userId,
      metadata: { reason: params.reason },
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  async sessionLimitEviction(params: {
    userId: string;
    evictedCount: number;
    ip?: string;
  }): Promise<void> {
    await this.auditLogService.log({
      action: SecurityEventType.SESSION_LIMIT_EVICTION,
      entityType: 'User',
      actorUserId: params.userId,
      metadata: { evictedCount: params.evictedCount },
      ip: params.ip,
    });
  }
}
