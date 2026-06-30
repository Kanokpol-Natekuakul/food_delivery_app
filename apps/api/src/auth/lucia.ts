/**
 * Lucia (auth) — แทนตัวตนฮาร์ดโค้ดเดิม (rider:somchai ฯลฯ) ด้วยเซสชันจริง
 * โครงตั้งต้น: adapter ผูกกับตาราง users/sessions ใน Drizzle
 */
import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
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

export type SessionUser = { actorId: string; role: string };

// ── รหัสผ่าน: scrypt (built-in) เก็บเป็น `salt:hash` — ไม่พึ่ง native dep ──
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(stored: string, password: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * อ่าน+ตรวจ session จาก cookie → คืน user หรือ null; ต่ออายุ cookie (rolling) / ล้าง cookie ที่หมดอายุ
 * เรียกใน preHandler ของ route ที่ต้องล็อกอิน
 */
export async function readSession(req: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> {
  const sessionId = req.cookies[lucia.sessionCookieName] ?? null;
  if (!sessionId) return null;
  const { session, user } = await lucia.validateSession(sessionId);
  if (session?.fresh) reply.header('set-cookie', lucia.createSessionCookie(session.id).serialize());
  if (!session) {
    reply.header('set-cookie', lucia.createBlankSessionCookie().serialize());
    return null;
  }
  return user;
}
