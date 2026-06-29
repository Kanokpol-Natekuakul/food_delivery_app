/**
 * Lucia (auth) — แทนตัวตนฮาร์ดโค้ดเดิม (rider:somchai ฯลฯ) ด้วยเซสชันจริง
 * โครงตั้งต้น: adapter ผูกกับตาราง users/sessions ใน Drizzle
 */
import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db, schema } from '../db/index.js';

const adapter = new DrizzlePostgreSQLAdapter(db, schema.sessions, schema.users);

export const lucia = new Lucia(adapter, {
  sessionCookie: { attributes: { secure: process.env.NODE_ENV === 'production' } },
  getUserAttributes: (attrs) => ({ actorId: attrs.actorId, role: attrs.role }),
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: { actorId: string; role: string };
  }
}
