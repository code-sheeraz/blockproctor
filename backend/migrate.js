import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
    console.log('Running database migrations...');

    // Create tracking table if not exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMP DEFAULT NOW()
        )
    `);

    const files = fs.readdirSync(path.join(__dirname, 'migrations'))
        .filter(f => f.endsWith('.sql'))
        .sort();

    let count = 0;
    for (const file of files) {
        const { rows } = await pool.query(
            'SELECT 1 FROM _migrations WHERE filename = $1',
            [file]
        );
        if (rows.length > 0) {
            console.log(`  ⏭️  ${file} (already applied)`);
            continue;
        }

        const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf-8');
        try {
            await pool.query(sql);
            await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
            console.log(`  ✅ ${file}`);
            count++;
        } catch (err) {
            console.error(`  ❌ ${file}: ${err.message}`);
            process.exit(1);
        }
    }

    if (count === 0) {
        console.log('  No new migrations to apply.');
    } else {
        console.log(`  Applied ${count} migration(s).`);
    }

    const backfilled = await backfillPasswordHashes();
    if (backfilled > 0) {
        console.log(`  🔐 Backfilled bcrypt hashes for ${backfilled} account(s), cleared plaintext passwords`);
    }

    await pool.end();
}

// Seed data and any pre-hash accounts store passwords in the plaintext
// `password` column. Convert those to bcrypt `password_hash` values so the
// login flow (which only accepts password_hash) keeps working, then clear
// the plaintext value. Idempotent: runs only on rows that still have one.
async function backfillPasswordHashes() {
    const { rows } = await pool.query(
        `SELECT 'users' AS table_name, id FROM users WHERE password IS NOT NULL AND password_hash IS NULL
         UNION ALL
         SELECT 'instructors' AS table_name, id FROM instructors WHERE password IS NOT NULL AND password_hash IS NULL
         UNION ALL
         SELECT 'admins' AS table_name, id FROM admins WHERE password IS NOT NULL AND password_hash IS NULL`
    );

    let count = 0;
    for (const row of rows) {
        const { rows: [account] } = await pool.query(
            `SELECT password FROM ${row.table_name} WHERE id = $1`,
            [row.id]
        );
        const hash = await bcrypt.hash(account.password, 12);
        await pool.query(
            `UPDATE ${row.table_name} SET password_hash = $1, password = NULL WHERE id = $2`,
            [hash, row.id]
        );
        count++;
    }
    return count;
}

runMigrations().catch(err => {
    console.error('Migration runner failed:', err);
    process.exit(1);
});
