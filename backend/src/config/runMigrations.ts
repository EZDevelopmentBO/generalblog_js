import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { pool } from './database';

const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

export async function run(): Promise<void> {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }
  console.log('Migrations completed.');
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
