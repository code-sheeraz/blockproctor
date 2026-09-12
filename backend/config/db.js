// config/db.js
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

/**
 * PostgreSQL connection pool. Reads configuration from environment variables
 * with sensible defaults for local development. The pool caps at 20 connections
 * and idles stale connections after 30 s.
 */
const pool = new Pool({
    host: process.env.DB_HOST || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "12345",
    database: process.env.DB_NAME || "blockproctor",
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('Unexpected DB pool error:', err.message);
});

/**
 * Attempts to connect to PostgreSQL with retry logic (5 attempts, 5 s apart).
 * Intended to run once at startup so the server fails fast on misconfiguration.
 * Always returns the pool — callers should not assume the connection succeeded.
 * @param {number} retries - Maximum number of connection attempts
 * @returns {import('pg').Pool}
 */
async function connectDB(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            client.release();
            console.log("Connected to PostgreSQL");
            return pool;
        } catch (err) {
            console.error("DB connection failed, retrying in 5s...", err.message);
            if (i < retries - 1) await new Promise((res) => setTimeout(res, 5000));
        }
    }
    console.error("Could not connect to DB after retries");
    return pool;
}

connectDB();

export default pool;
