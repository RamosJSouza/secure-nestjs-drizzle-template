import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { roles } from './roles.schema';
import { features } from './features.schema';
import { permissions } from './permissions.schema';
import { rolePermissions } from './role-permissions.schema';
import { sessions } from './sessions.schema';
import { organizations } from './organizations.schema';
import { auditLogs } from './audit-logs.schema';
import { webhookEndpoints } from './webhook-endpoints.schema';
import { webhookDeliveries } from './webhook-deliveries.schema';

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
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
  users: many(users),
  webhookEndpoints: many(webhookEndpoints),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actorUser: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [webhookEndpoints.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, { fields: [webhookEndpoints.createdById], references: [users.id] }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  endpoint: one(webhookEndpoints, {
    fields: [webhookDeliveries.endpointId],
    references: [webhookEndpoints.id],
  }),
}));
