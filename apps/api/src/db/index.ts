/** Drizzle client (Postgres) — ใช้ใน route/job แบบ db.transaction(...) */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('ต้องตั้ง DATABASE_URL (ดู .env.example)');

const client = postgres(url);
export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
