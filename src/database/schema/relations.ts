import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { roles } from './roles.schema';
import { features } from './features.schema';
import { permissions } from './permissions.schema';
import { rolePermissions } from './role-permissions.schema';
import { sessions } from './sessions.schema';
import { organizations } from './organizations.schema';
import { auditLogs } from './audit-logs.schema';

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  sessions: many(sessions),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  users: many(users),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  permissions: many(permissions),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  feature: one(features, { fields: [permissions.featureId], references: [features.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actorUser: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
