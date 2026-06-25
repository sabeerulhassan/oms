import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

// Force SSL configuration if connecting to AWS RDS
const isRDS = connectionString?.includes("amazonaws.com");

export const pool = new Pool({
  connectionString,
  ssl: isRDS
    ? {
        rejectUnauthorized: false, // Bypasses SSL certificate verification for RDS self-signed certs
      }
    : false,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);