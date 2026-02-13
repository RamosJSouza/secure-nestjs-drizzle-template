import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddSessionsRotatedFromIndex1740300000000 implements MigrationInterface {
  name = 'AddSessionsRotatedFromIndex1740300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        columnNames: ['rotated_from_session_id'],
        name: 'IDX_sessions_rotated_from_session_id',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'sessions',
      'IDX_sessions_rotated_from_session_id',
    );
  }
}
