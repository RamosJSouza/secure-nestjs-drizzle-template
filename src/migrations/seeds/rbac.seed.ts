import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as schema from '@/database/schema';
import { features } from '@/database/schema/features.schema';
import { permissions } from '@/database/schema/permissions.schema';
import { roles } from '@/database/schema/roles.schema';
import { rolePermissions } from '@/database/schema/role-permissions.schema';
import { users } from '@/database/schema/users.schema';

export async function seedRbac(db: NodePgDatabase<typeof schema>) {
  await db.transaction(async (tx) => {
    console.log('🌱 Starting RBAC Seed...');

    const featuresData = [
      { key: 'rbac', name: 'Gerenciamento RBAC', description: 'Gerenciar roles, features e permissões' },
      { key: 'users', name: 'Gerenciamento de Usuários', description: 'Gerenciar usuários do sistema' },
      { key: 'financial', name: 'Dashboard Financeiro', description: 'Acesso a dados financeiros' },
    ];

    await tx
      .insert(features)
      .values(featuresData.map((f) => ({ ...f, isActive: true })))
      .onConflictDoNothing({ target: features.key });

    const dbFeatures = await tx.select().from(features);
    const featureMap = Object.fromEntries(dbFeatures.map((f) => [f.key, f]));
    console.log(`✅ Features upserted: ${featuresData.length}`);

    const permissionsData = [
      { featureKey: 'rbac', action: 'view', name: 'Visualizar' },
      { featureKey: 'rbac', action: 'create', name: 'Criar' },
      { featureKey: 'rbac', action: 'edit', name: 'Editar' },
      { featureKey: 'rbac', action: 'delete', name: 'Deletar' },
      { featureKey: 'rbac', action: 'assign_permissions', name: 'Atribuir Permissões' },
      { featureKey: 'users', action: 'view', name: 'Visualizar' },
      { featureKey: 'users', action: 'create', name: 'Criar' },
      { featureKey: 'users', action: 'edit', name: 'Editar' },
      { featureKey: 'users', action: 'delete', name: 'Deletar' },
    ];

    await tx
      .insert(permissions)
      .values(
        permissionsData.map((p) => {
          const feature = featureMap[p.featureKey];
          return {
            featureId: feature.id,
            action: p.action,
            name: p.name,
            description: `Permissão para ${p.action} em ${feature.name}`,
          };
        }),
      )
      .onConflictDoNothing({ target: [permissions.featureId, permissions.action] });

    const dbPermissions = await tx.select().from(permissions);
    const permissionMap = Object.fromEntries(
      dbPermissions.map((p) => [`${p.featureId}:${p.action}`, p]),
    );
    const allPermissions = permissionsData.map(
      (p) => permissionMap[`${featureMap[p.featureKey].id}:${p.action}`],
    );
    console.log(`✅ Permissions upserted: ${permissionsData.length}`);

    const rolesData = [
      { name: 'Super Admin', description: 'Acesso total ao sistema' },
      { name: 'Manager', description: 'Gestão de usuários e relatórios' },
      { name: 'Viewer', description: 'Apenas visualização' },
    ];

    await tx
      .insert(roles)
      .values(rolesData.map((r) => ({ ...r, isActive: true })))
      .onConflictDoNothing({ target: roles.name });

    const dbRoles = await tx.select().from(roles);
    const roleMap = Object.fromEntries(dbRoles.map((r) => [r.name, r]));
    console.log(`✅ Roles upserted: ${rolesData.length}`);

    const adminRole = roleMap['Super Admin'];

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, adminRole.id));

    await tx.insert(rolePermissions).values(
      allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id, granted: true })),
    );
    console.log(`✅ Assigned ${allPermissions.length} permissions to Super Admin`);

    const adminEmail = 'ramosinfo@gmail.com';
    const [adminUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('Admin@123456', 10);
      await tx.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        name: 'System Administrator',
        roleId: adminRole.id,
        isActive: true,
      });
      console.log(`✅ Super Admin user created: ${adminEmail}`);
    } else {
      if (adminUser.roleId !== adminRole.id) {
        await tx.update(users).set({ roleId: adminRole.id }).where(eq(users.email, adminEmail));
        console.log(`ℹ️ Updated Super Admin role linkage`);
      } else {
        console.log(`ℹ️ Super Admin user already exists`);
      }
    }

    console.log('✨ Seed completed successfully!');
  });
}
