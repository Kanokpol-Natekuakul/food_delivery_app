/**
 * เส้นทางออเดอร์ — เทียบ store action 'adminCancelOrder'
 * force-cancel: adminCancel (โดเมน) → ถ้าเกิด settlement ลงบัญชี wallet แบบ atomic
 */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { adminCancel } from '@app/domain/order/transitions.js';
import type { OrderState } from '@app/domain/order/state.js';
import { settle } from '@app/domain/settlement/settlement.js';
import { postSettlement } from '@app/domain/wallet/wallet.js';
import { db, schema } from '../db/index.js';
import { loadLedger, persistAppended } from '../services/ledger.js';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/orders', async () => db.select().from(schema.orders));

  app.post<{ Params: { id: string } }>('/orders/:id/cancel', async (req, reply) => {
    const { id } = req.params;
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id));
      if (!row) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });

      const result = adminCancel(row.state as OrderState); // โดเมนตัดสิน (ออเดอร์จบแล้วยกเลิกซ้ำไม่ได้)
      if (!result.ok) return reply.code(409).send({ error: result.reason });

      await tx.update(schema.orders).set({ state: result.state }).where(eq(schema.orders.id, id));

      // CancelledByAdmin → ไม่มีรายได้ แต่คืนเต็ม + แพลตฟอร์มแบกค่าอาหาร (settle ตัดสิน)
      const settlement = settle(result.state, row.amounts);
      if (settlement) {
        const before = await loadLedger(tx);
        const merchantAccount = `merchant:${row.restaurantId ?? 'unknown'}`;
        const after = postSettlement(before, id, merchantAccount, settlement);
        await persistAppended(tx, before, after);
      }
      return { ok: true, state: result.state, settlement };
    });
  });
}
