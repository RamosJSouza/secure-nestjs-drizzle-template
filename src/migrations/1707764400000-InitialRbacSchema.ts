import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitialRbacSchema1707764400000 implements MigrationInterface {
    name = 'InitialRbacSchema1707764400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

        await queryRunner.createTable(new Table({
            name: 'features',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'key',
                    type: 'varchar',
                    isUnique: true,
                },
                {
                    name: 'name',
                    type: 'varchar',
                },
                {
                    name: 'description',
                    type: 'text',
                    isNullable: true,
                },
                {
                    name: 'isActive',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()',
                },
                {
                    name: 'updatedAt',
                    type: 'timestamp',
                    default: 'now()',
                },
            ],
        }), true);

        await queryRunner.createIndex('features', new TableIndex({
            columnNames: ['key', 'isActive'],
            name: 'IDX_feature_key_active'
        }));


        await queryRunner.createTable(new Table({
            name: 'permissions',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'feature_id',
                    type: 'uuid',
                },
                {
                    name: 'action', // 'view', 'create', etc.
                    type: 'varchar',
                },
                {
                    name: 'name',
                    type: 'varchar',
                },
                {
                    name: 'description',
                    type: 'text',
                    isNullable: true,
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()',
                },
                {
                    name: 'updatedAt',
                    type: 'timestamp',
                    default: 'now()',
                },
            ],
        }), true);

        await queryRunner.createIndex('permissions', new TableIndex({
            columnNames: ['feature_id', 'action'],
            isUnique: true,
            name: 'IDX_permission_feature_action_unique'
        }));

        await queryRunner.createForeignKey('permissions', new TableForeignKey({
            columnNames: ['feature_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'features',
            onDelete: 'CASCADE',
        }));


        await queryRunner.createTable(new Table({
            name: 'roles',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'name',
                    type: 'varchar',
                    isUnique: true,
                },
                {
                    name: 'description',
                    type: 'text',
                    isNullable: true,
                },
                {
                    name: 'isActive',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()',
                },
                {
                    name: 'updatedAt',
                    type: 'timestamp',
                    default: 'now()',
                },
            ],
        }), true);

        await queryRunner.query(`CREATE INDEX "IDX_roles_is_active_partial" ON "roles" ("id") WHERE "isActive" = true`);

        await queryRunner.createTable(new Table({
            name: 'users',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'email',
                    type: 'varchar',
                    isUnique: true,
                },
                {
                    name: 'password',
                    type: 'varchar',
                },
                {
                    name: 'name',
                    type: 'varchar',
                },
                {
                    name: 'role_id',
                    type: 'uuid',
                    isNullable: true,
                },
                {
                    name: 'isActive',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()',
                },
                {
                    name: 'updatedAt',
                    type: 'timestamp',
                    default: 'now()',
                },
                {
                    name: 'deletedAt',
                    type: 'timestamp',
                    isNullable: true,
                },
            ],
        }), true);

        await queryRunner.query(`CREATE INDEX "IDX_users_is_active_partial" ON "users" ("email") WHERE "isActive" = true`);

        await queryRunner.createIndex('users', new TableIndex({
            columnNames: ['role_id'],
            name: 'IDX_users_role_id'
        }));

        await queryRunner.createForeignKey('users', new TableForeignKey({
            columnNames: ['role_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'roles',
            onDelete: 'SET NULL',
        }));


        await queryRunner.createTable(new Table({
            name: 'role_permissions',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'role_id',
                    type: 'uuid',
                },
                {
                    name: 'permission_id',
                    type: 'uuid',
                },
                {
                    name: 'granted',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()',
                },
            ],
        }), true);

        await queryRunner.createIndex('role_permissions', new TableIndex({
            columnNames: ['role_id', 'permission_id'],
            isUnique: true,
            name: 'IDX_role_permissions_unique'
        }));

        await queryRunner.createForeignKey('role_permissions', new TableForeignKey({
            columnNames: ['role_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'roles',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createForeignKey('role_permissions', new TableForeignKey({
            columnNames: ['permission_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'permissions',
            onDelete: 'CASCADE',
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const tables = ['role_permissions', 'users', 'roles', 'permissions', 'features'];

        for (const table of tables) {
            await queryRunner.dropTable(table, true, true, true);
        }
    }
}
