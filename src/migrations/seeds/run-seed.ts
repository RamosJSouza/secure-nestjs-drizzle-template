import * as dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/database/schema';
import { seedRbac } from './rbac.seed';

async function run() {
  let exitCode = 0;
  console.log('🌱 RBAC Seed: starting...');

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const db = drizzle(pool, { schema });
    console.log('🌱 RBAC Seed: database connected');

    await seedRbac(db);

    console.log('🌱 RBAC Seed: completed successfully');
  } catch (err) {
    console.error('🌱 RBAC Seed: failed', err);
    exitCode = 1;
  } finally {
    await pool.end();
    console.log('🌱 RBAC Seed: connection closed');
    process.exit(exitCode);
  }
}

run();
