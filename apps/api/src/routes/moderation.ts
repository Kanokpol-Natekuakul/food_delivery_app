/**
 * เส้นทางกำกับดูแล (ADR 0006) — suspend/unsuspend + บริการ auto-action ขั้นบันได
 * บริการ planAutoActions อยู่ใน services/moderation.ts (ใช้ซ้ำหลังบันทึก dispute ด้วย)
 */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { runAutoActions } from '../services/moderation.js';
import { requireAdmin } from './auth.js';

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/moderation', async () => db.select().from(schema.moderation));

  // การลงโทษผู้ใช้ = งานแอดมินเท่านั้น (authorization จาก session.role)
  app.post<{ Params: { account: string } }>('/moderation/:account/suspend', async (req, reply) => {
    if (!await requireAdmin(req, reply)) return reply;
    await db.transaction(async (tx) => {
      await tx.insert(schema.moderation).values({ account: req.params.account }).onConflictDoNothing();
      await tx.update(schema.moderation).set({ suspended: true }).where(eq(schema.moderation.account, req.params.account));
    });
    return { ok: true };
  });

  app.post<{ Params: { account: string } }>('/moderation/:account/unsuspend', async (req, reply) => {
    if (!await requireAdmin(req, reply)) return reply;
    await db.update(schema.moderation).set({ suspended: false }).where(eq(schema.moderation.account, req.params.account));
    return { ok: true };
  });

  // บริการ auto-action ขั้นบันได (เรียกตรงก็ได้ หรือถูกเรียกอัตโนมัติหลังยื่นร้องเรียน)
  app.post('/moderation/run-auto-actions', async (req, reply) => {
    if (!await requireAdmin(req, reply)) return reply;
    return db.transaction((tx) => runAutoActions(tx));
  });
}
