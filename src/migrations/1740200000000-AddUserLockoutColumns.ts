import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserLockoutColumns1740200000000 implements MigrationInterface {
  name = 'AddUserLockoutColumns1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'failed_login_attempts',
        type: 'int',
        default: 0,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'locked_until',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'locked_until');
    await queryRunner.dropColumn('users', 'failed_login_attempts');
  }
}
