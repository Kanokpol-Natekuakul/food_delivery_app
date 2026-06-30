/**
 * เส้นทาง auth (Lucia) — login/logout/me + guard สำหรับ route ที่ต้องล็อกอิน/เป็นแอดมิน
 * แทนตัวตนฮาร์ดโค้ดเดิม: ตัวตนผู้ใช้มาจาก session cookie (req → user.actorId) ไม่เชื่อ body
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { lucia, verifyPassword, readSession } from '../auth/lucia.js';
import type { SessionUser } from '../auth/lucia.js';

/** ต้องล็อกอิน — คืน user หรือส่ง 401 แล้วคืน null (ผู้เรียกต้อง return ทันทีถ้า null) */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> {
  const user = await readSession(req, reply);
  if (!user) { await reply.code(401).send({ error: 'ต้องเข้าสู่ระบบก่อน' }); return null; }
  return user;
}

/** ต้องเป็นแอดมิน — 401 ถ้าไม่ล็อกอิน, 403 ถ้าบทบาทไม่ใช่ admin */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role !== 'admin') { await reply.code(403).send({ error: 'ต้องเป็นแอดมิน' }); return null; }
  return user;
}

/** ต้องเป็นแอดมิน หรือ merchant เจ้าของร้านนั้น (actorId === `merchant:<restaurantId>`) */
export async function requireMerchantOf(req: FastifyRequest, reply: FastifyReply, restaurantId: string): Promise<SessionUser | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role === 'admin' || (user.role === 'merchant' && user.actorId === `merchant:${restaurantId}`)) return user;
  await reply.code(403).send({ error: 'แก้ได้เฉพาะเมนูร้านของตัวเอง' });
  return null;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { actorId: string; password: string } }>('/auth/login', async (req, reply) => {
    const { actorId, password } = req.body;
    const [row] = await db.select().from(schema.users).where(eq(schema.users.actorId, actorId));
    if (!row || !verifyPassword(row.passwordHash, password)) {
      return reply.code(401).send({ error: 'actorId หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const session = await lucia.createSession(row.id, {});
    reply.header('set-cookie', lucia.createSessionCookie(session.id).serialize());
    return { actorId: row.actorId, role: row.role };
  });

  app.post('/auth/logout', async (req, reply) => {
    const sessionId = req.cookies[lucia.sessionCookieName] ?? null;
    if (sessionId) await lucia.invalidateSession(sessionId);
    reply.header('set-cookie', lucia.createBlankSessionCookie().serialize());
    return { ok: true };
  });

  app.get('/auth/me', async (req, reply) => {
    const user = await readSession(req, reply);
    if (!user) return reply.code(401).send({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
    return user;
  });
}
