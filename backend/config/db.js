// config/db.js
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

let pool;

const connectDB = async (retries = 5) => {
  pool = new Pool({
    host: process.env.DB_HOST || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "12345",
    database: process.env.DB_NAME || "blockproctor",
    port: process.env.DB_PORT || 5432,
  });

  for (let i = 0; i < retries; i++) {
    try {
      await pool.connect();
      console.log("✅ Connected to PostgreSQL");
      return pool;
    } catch (err) {
      console.error("❌ DB connection failed, retrying in 5s...", err.message);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }

  throw new Error("Could not connect to DB");
};

const db = await connectDB();
export default db;
