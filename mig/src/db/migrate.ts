import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const runMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is missing.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // This encrypts the connection but skips the strict .pem file check
    }
  });
  try {
    await client.connect();
    console.log('✅ Connected to database.');

    // 1. Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // 2. Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sorts alphabetically (001 -> 005)

    // 3. Execute new migrations
    for (const file of files) {
      const { rows } = await client.query('SELECT name FROM _migrations WHERE name = $1', [file]);
      
      if (rows.length === 0) {
        console.log(`⏳ Running migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        // Run each migration inside a transaction
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`✅ Successfully applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Failed at migration: ${file}`);
          throw err;
        }
      } else {
        console.log(`⏭️  Skipping ${file} (already applied)`);
      }
    }

    console.log('🎉 All migrations are up to date.');
  } catch (error) {
    console.error('Fatal Migration Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runMigrations();