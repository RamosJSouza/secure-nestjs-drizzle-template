import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
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

    const featureMap: Record<string, schema.Feature> = {};

    for (const f of featuresData) {
      const [existing] = await tx.select().from(features).where(eq(features.key, f.key)).limit(1);
      if (!existing) {
        const [created] = await tx.insert(features).values({ ...f, isActive: true }).returning();
        featureMap[f.key] = created;
        console.log(`✅ Feature created: ${f.key}`);
      } else {
        featureMap[f.key] = existing;
        console.log(`ℹ️ Feature already exists: ${f.key}`);
      }
    }

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

    const allPermissions: schema.Permission[] = [];

    for (const p of permissionsData) {
      const feature = featureMap[p.featureKey];
      const [existing] = await tx
        .select()
        .from(permissions)
        .where(and(eq(permissions.featureId, feature.id), eq(permissions.action, p.action)))
        .limit(1);

      if (!existing) {
        const [created] = await tx
          .insert(permissions)
          .values({
            featureId: feature.id,
            action: p.action,
            name: p.name,
            description: `Permissão para ${p.action} em ${feature.name}`,
          })
          .returning();
        allPermissions.push(created);
        console.log(`✅ Permission created: ${p.featureKey}:${p.action}`);
      } else {
        allPermissions.push(existing);
      }
    }

    const rolesData = [
      { name: 'Super Admin', description: 'Acesso total ao sistema' },
      { name: 'Manager', description: 'Gestão de usuários e relatórios' },
      { name: 'Viewer', description: 'Apenas visualização' },
    ];

    const roleMap: Record<string, schema.Role> = {};

    for (const r of rolesData) {
      const [existing] = await tx.select().from(roles).where(eq(roles.name, r.name)).limit(1);
      if (!existing) {
        const [created] = await tx
          .insert(roles)
          .values({ ...r, isActive: true })
          .returning();
        roleMap[r.name] = created;
        console.log(`✅ Role created: ${r.name}`);
      } else {
        roleMap[r.name] = existing;
      }
    }

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
