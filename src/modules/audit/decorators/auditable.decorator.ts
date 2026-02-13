import { SetMetadata } from '@nestjs/common';

export const AUDITABLE_KEY = 'auditable';

export interface AuditableOptions {
  action: string;
  entityType: string;
  entityIdParam?: number | string;
  entityIdFromResult?: string;
}

export function Auditable(
  action: string,
  entityType: string,
  options?: Partial<Pick<AuditableOptions, 'entityIdParam' | 'entityIdFromResult'>>,
) {
  return SetMetadata(AUDITABLE_KEY, {
    action,
    entityType,
    entityIdParam: options?.entityIdParam,
    entityIdFromResult: options?.entityIdFromResult,
  } as AuditableOptions);
}
