import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCorrelationIdToAuditLogs1740400000000 implements MigrationInterface {
  name = 'AddCorrelationIdToAuditLogs1740400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'audit_logs',
      new TableColumn({
        name: 'correlation_id',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('audit_logs', 'correlation_id');
  }
}
