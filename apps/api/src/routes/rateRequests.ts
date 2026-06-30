/**
 * เส้นทางเจรจาอัตราคอมมิชชันสองทาง (ADR 0003) — เทียบ store actions:
 * submit/approve/reject/counter/accept/decline; อนุมัติ/ตอบรับ → upsert rate_overrides ด้วย agreedRate
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  requestRate, approveRate, rejectRate, counterRate, acceptCounter, declineCounter, agreedRate,
} from '@app/domain/revenue/revenue.js';
import type { RateRequest, RateRequestResult } from '@app/domain/revenue/revenue.js';
import { db, schema } from '../db/index.js';
import type { Db } from '../db/index.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toRequest = (r: typeof schema.rateRequests.$inferSelect): RateRequest => ({
  id: r.id, merchantId: r.merchantId, currentRate: r.currentRate, proposedRate: r.proposedRate,
  reason: r.reason, status: r.status as RateRequest['status'],
  ...(r.counterRate !== null ? { counterRate: r.counterRate } : {}),
});

async function upsertOverride(tx: Tx, merchantId: string, rate: number): Promise<void> {
  await tx.insert(schema.rateOverrides).values({ merchantId, commissionRate: rate })
    .onConflictDoUpdate({ target: schema.rateOverrides.merchantId, set: { commissionRate: rate } });
}

/** โหลดคำขอ → ใช้ transition โดเมน → เขียนสถานะกลับ (+override ถ้าตกลงราคาแล้ว) */
async function transition(
  reply: FastifyReply, id: string, fn: (r: RateRequest) => RateRequestResult, settles: boolean,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.rateRequests).where(eq(schema.rateRequests.id, id));
    if (!row) return reply.code(404).send({ error: 'ไม่พบคำขอ' });

    const result = fn(toRequest(row));
    if (!result.ok) return reply.code(409).send({ error: result.reason });

    await tx.update(schema.rateRequests)
      .set({ status: result.request.status, counterRate: result.request.counterRate ?? null })
      .where(eq(schema.rateRequests.id, id));
    if (settles) await upsertOverride(tx, result.request.merchantId, agreedRate(result.request));

    return result.request;
  });
}

export async function rateRequestRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rate-requests', async () => db.select().from(schema.rateRequests));

  // อัตราคอมที่เจรจาแล้วต่อร้าน (merchantId → rate) — ฝั่ง web hydrate state.rateOverrides จากนี่
  app.get('/rate-overrides', async () => {
    const rows = await db.select().from(schema.rateOverrides);
    return Object.fromEntries(rows.map((r) => [r.merchantId, r.commissionRate]));
  });

  // ร้านยื่นขอลด
  app.post<{ Body: { merchantId: string; currentRate: number; proposedRate: number; reason?: string } }>(
    '/rate-requests', async (req, reply) => {
      const b = req.body;
      const result = requestRate({
        id: randomUUID(), merchantId: b.merchantId, currentRate: b.currentRate,
        proposedRate: b.proposedRate, reason: b.reason ?? '',
      });
      if (!result.ok) return reply.code(409).send({ error: result.reason });
      await db.insert(schema.rateRequests).values({
        id: result.request.id, merchantId: result.request.merchantId, currentRate: result.request.currentRate,
        proposedRate: result.request.proposedRate, reason: result.request.reason, status: result.request.status,
        counterRate: null,
      });
      return result.request;
    });

  // แอดมิน: อนุมัติ / ปฏิเสธ / เสนอแย้ง
  app.post<{ Params: { id: string } }>('/rate-requests/:id/approve', (req, reply) => transition(reply, req.params.id, approveRate, true));
  app.post<{ Params: { id: string } }>('/rate-requests/:id/reject', (req, reply) => transition(reply, req.params.id, rejectRate, false));
  app.post<{ Params: { id: string }; Body: { counter: number } }>('/rate-requests/:id/counter', (req, reply) =>
    transition(reply, req.params.id, (r) => counterRate(r, req.body.counter), false));

  // ร้าน: ตอบรับ / ปฏิเสธข้อเสนอแย้ง
  app.post<{ Params: { id: string } }>('/rate-requests/:id/accept', (req, reply) => transition(reply, req.params.id, acceptCounter, true));
  app.post<{ Params: { id: string } }>('/rate-requests/:id/decline', (req, reply) => transition(reply, req.params.id, declineCounter, false));
}
