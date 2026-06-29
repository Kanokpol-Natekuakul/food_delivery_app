/**
 * เส้นทางร้องเรียน (ADR 0006) — แสดงหลักการ "reducer action → route + transaction"
 * โหลดสถานะ → เรียกฟังก์ชันโดเมน (pure) → เขียนกลับใน transaction เดียว
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { fileComplaint, resolveGoodwill } from '@app/domain/dispute/dispute.js';
import type { Dispute, DisputeCategory } from '@app/domain/dispute/dispute.js';
import type { OrderState } from '@app/domain/order/state.js';
import { postGoodwill } from '@app/domain/wallet/wallet.js';
import { db, schema } from '../db/index.js';
import { loadLedger, persistAppended } from '../services/ledger.js';
import { runAutoActions } from '../services/moderation.js';

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/disputes', async () => db.select().from(schema.disputes));

  // เทียบ store action 'fileDispute' (+applyAutoActions): ลูกค้ายื่น → บันทึก → คำนวณ auto-action
  app.post<{ Body: { orderId: string; customer: string; merchant: string; rider: string; category: DisputeCategory; hasPhoto: boolean } }>(
    '/disputes', async (req, reply) => {
      const b = req.body;
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, b.orderId));
        if (!order) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });

        const minutesSinceCompleted = (Date.now() - new Date(order.createdAt).getTime()) / 60_000;
        const result = fileComplaint(
          { id: randomUUID(), orderId: b.orderId, customer: b.customer, merchant: b.merchant, rider: b.rider, category: b.category, hasPhoto: b.hasPhoto },
          { orderKind: (order.state as OrderState).kind, minutesSinceCompleted },
        );
        if (!result.ok) return reply.code(409).send({ error: result.reason });

        await tx.insert(schema.disputes).values({
          id: result.dispute.id, orderId: result.dispute.orderId, customer: result.dispute.customer,
          merchant: result.dispute.merchant, rider: result.dispute.rider, category: result.dispute.category,
          hasPhoto: result.dispute.hasPhoto, status: result.dispute.status, refund: result.dispute.refund,
        });

        const plan = await runAutoActions(tx); // ยกระดับการลงโทษอัตโนมัติ (ถ้าสถิติถึงเกณฑ์)
        return { dispute: result.dispute, autoAction: plan };
      });
    });

  // เทียบ store action 'resolveDispute': คืน goodwill + ลงบัญชี (แพลตฟอร์มแบก) แบบ atomic
  app.post<{ Params: { id: string }; Body: { amount: number } }>(
    '/disputes/:id/resolve',
    async (req, reply) => {
      const { id } = req.params;
      const { amount } = req.body;
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(schema.disputes).where(eq(schema.disputes.id, id));
        if (!row) return reply.code(404).send({ error: 'ไม่พบคำร้อง' });

        const dispute = row as unknown as Dispute;
        const result = resolveGoodwill(dispute, amount); // โดเมนตัดสิน (pure)
        if (!result.ok) return reply.code(409).send({ error: result.reason });

        await tx.update(schema.disputes)
          .set({ status: result.dispute.status, refund: result.dispute.refund })
          .where(eq(schema.disputes.id, id));

        const before = await loadLedger(tx);
        const after = postGoodwill(before, result.dispute.id, amount);
        await persistAppended(tx, before, after);

        return { ok: true, dispute: result.dispute };
      });
    },
  );
}
