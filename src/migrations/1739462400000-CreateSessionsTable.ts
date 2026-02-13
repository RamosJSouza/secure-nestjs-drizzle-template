import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateSessionsTable1739462400000 implements MigrationInterface {
  name = 'CreateSessionsTable1739462400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'refresh_token_hash',
            type: 'varchar',
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
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'revoked_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'rotated_from_session_id',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        columnNames: ['user_id'],
        name: 'IDX_sessions_user_id',
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        columnNames: ['refresh_token_hash'],
        name: 'IDX_sessions_refresh_token_hash',
      }),
    );

    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        columnNames: ['rotated_from_session_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sessions',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const sessionsTable = await queryRunner.getTable('sessions');
    if (sessionsTable) {
      const foreignKeys = sessionsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('sessions', fk);
      }
    }
    await queryRunner.dropTable('sessions', true);
  }
}
