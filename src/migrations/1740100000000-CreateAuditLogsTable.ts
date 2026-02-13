import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAuditLogsTable1740100000000 implements MigrationInterface {
  name = 'CreateAuditLogsTable1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'actor_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
          },
          {
            name: 'entity_type',
            type: 'varchar',
          },
          {
            name: 'entity_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
          },
          {
            name: 'ip',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        columnNames: ['organization_id', 'createdAt'],
        name: 'IDX_audit_logs_org_created',
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        columnNames: ['actor_user_id', 'createdAt'],
        name: 'IDX_audit_logs_actor_created',
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        columnNames: ['entity_type', 'entity_id'],
        name: 'IDX_audit_logs_entity',
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        columnNames: ['action', 'createdAt'],
        name: 'IDX_audit_logs_action_created',
      }),
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['organization_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['actor_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const auditLogsTable = await queryRunner.getTable('audit_logs');
    if (auditLogsTable) {
      const foreignKeys = auditLogsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('audit_logs', fk);
      }
    }
    await queryRunner.dropTable('audit_logs', true);
  }
}
