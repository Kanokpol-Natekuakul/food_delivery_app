/**
 * เส้นทางออเดอร์ — เทียบ store action 'adminCancelOrder'
 * force-cancel: adminCancel (โดเมน) → ถ้าเกิด settlement ลงบัญชี wallet แบบ atomic
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  adminCancel, placeOrder, claimJob,
  merchantAccept, merchantMarkReady, merchantReject,
  riderArriveAtMerchant, pickup, riderArriveAtCustomer, confirmDelivery, declareFailedDelivery, releaseClaim,
} from '@app/domain/order/transitions.js';
import type { OrderState } from '@app/domain/order/state.js';
import type { TransitionResult } from '@app/domain/order/transitions.js';
import { requireUser, requireMerchantOf, requireAdmin } from './auth.js';

// ราง "ร้าน" — แก้ได้โดย merchant เจ้าของร้าน/admin
const MERCHANT_TX: Record<string, (s: OrderState) => TransitionResult> = {
  accept: merchantAccept, markReady: merchantMarkReady, reject: merchantReject,
};
// ราง "ไรเดอร์" — แก้ได้โดยไรเดอร์ที่ถือออเดอร์นี้ (riderId ตรง session)
const RIDER_TX: Record<string, (s: OrderState) => TransitionResult> = {
  arriveAtMerchant: riderArriveAtMerchant, pickup, arriveAtCustomer: riderArriveAtCustomer,
  confirmDelivery: (s) => confirmDelivery(s, { otpMatches: true }),
  declareFailed: (s) => declareFailedDelivery(s, { attemptsExhausted: true }),
  release: releaseClaim,
};
import type { OrderLine } from '@app/domain/cart/cart.js';
import { foodTotal, SERVICE_FEE } from '@app/domain/cart/cart.js';
import { haversineKm, deliveryFee } from '@app/domain/delivery/delivery.js';
import { settle } from '@app/domain/settlement/settlement.js';
import { postSettlement } from '@app/domain/wallet/wallet.js';
import { restaurants, findRestaurant, CUSTOMER_LOCATION } from '@app/domain/catalog/catalog.js';
import { db, schema } from '../db/index.js';
import { loadLedger, persistAppended } from '../services/ledger.js';
import type { Amounts, Settlement } from '@app/domain/settlement/settlement.js';
import type { Db } from '../db/index.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * ลงบัญชี settlement ของออเดอร์ที่ถึงปลายทาง (สำเร็จ/ส่งไม่ได้/ร้านปฏิเสธ/ยกเลิก) เข้า ledger
 * idempotent: ถ้าออเดอร์นี้ลง ledger แล้ว จะไม่ลงซ้ำ (กันจ่ายซ้ำเมื่อถึงปลายทางได้หลายเส้นทาง เช่น confirmDelivery + complete)
 * คืน settlement (null = ยังไม่ถึงปลายทาง เช่น AwaitingHandoff/InTransit → ไม่ลงบัญชี)
 */
async function settleOrderToLedger(
  tx: Tx, orderId: string, restaurantId: string | null, amounts: Amounts, state: OrderState,
): Promise<Settlement | null> {
  const settlement = settle(state, amounts);
  if (!settlement) return null;
  const before = await loadLedger(tx);
  if (before.some((e) => e.orderId === orderId)) return settlement; // ลงแล้ว ไม่ลงซ้ำ
  const after = postSettlement(before, orderId, `merchant:${restaurantId ?? 'unknown'}`, settlement);
  await persistAppended(tx, before, after);
  return settlement;
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/orders', async () => db.select().from(schema.orders));

  // วางออเดอร์สด (cart → order ลง DB) — เทียบ store action 'place'; คืน id ให้ฝั่ง web adopt
  // amounts คิดด้วยฟังก์ชันโดเมน (เหมือน demo seed); state เริ่มต้น = placeOrder()
  app.post<{ Body: { restaurantId: string | null; lines: OrderLine[]; customer?: string; rider?: string } }>(
    '/orders', async (req) => {
      const b = req.body;
      const r = findRestaurant(restaurants, b.restaurantId ?? undefined);
      const amounts = {
        food: foodTotal({ lines: b.lines }),
        delivery: r ? deliveryFee(haversineKm(CUSTOMER_LOCATION, r.coord)) : 0,
        service: SERVICE_FEE,
      };
      const id = randomUUID();
      const state = placeOrder();
      await db.insert(schema.orders).values({
        id, restaurantId: b.restaurantId, riderId: b.rider ?? null, customerId: b.customer ?? null,
        placed: { restaurantId: b.restaurantId, lines: b.lines }, amounts, state,
      });
      return { id, state };
    });

  // ดันสถานะออเดอร์เป็น Completed (จุดที่ปลดล็อกการร้องเรียน) — เทียบ web setOrder→Completed
  // ต้องล็อกอิน (ไม่งั้นใครก็ปิดออเดอร์คนอื่นเป็นสำเร็จได้) + ลง settlement เมื่อจบ (idempotent)
  app.post<{ Params: { id: string } }>('/orders/:id/complete', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const { id } = req.params;
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id));
      if (!row) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });
      const state: OrderState = { kind: 'Completed' };
      await tx.update(schema.orders).set({ state }).where(eq(schema.orders.id, id));
      const settlement = await settleOrderToLedger(tx, id, row.restaurantId, row.amounts as Amounts, state);
      return { ok: true, state, settlement };
    });
  });

  // ไรเดอร์ (จาก session) คว้างาน — pull-based dispatch (ADR 0001): assign riderId + transition
  // ตัวตนไรเดอร์มาจาก session ไม่ใช่ body (ลูกค้าที่วางออเดอร์ ≠ ไรเดอร์); ถูกพักงาน → คว้าไม่ได้
  app.post<{ Params: { id: string } }>('/orders/:id/claim', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    if (user.role !== 'rider') return reply.code(403).send({ error: 'ต้องเป็นไรเดอร์' });
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, req.params.id));
      if (!row) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });

      const [mod] = await tx.select().from(schema.moderation).where(eq(schema.moderation.account, user.actorId));
      const result = claimJob(row.state as OrderState, { riderSuspended: mod?.suspended ?? false });
      if (!result.ok) return reply.code(409).send({ error: result.reason });

      await tx.update(schema.orders).set({ state: result.state, riderId: user.actorId }).where(eq(schema.orders.id, req.params.id));
      return { ok: true, state: result.state, riderId: user.actorId };
    });
  });

  // เดิน state machine ทั้งราง ร้าน+ไรเดอร์ (pickup/deliver ฯลฯ) — auth ตามราง, โดเมนตัดสิน transition
  app.post<{ Params: { id: string }; Body: { action: string } }>('/orders/:id/transition', async (req, reply) => {
    const { action } = req.body;
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, req.params.id));
    if (!order) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });

    const merchantFn = MERCHANT_TX[action];
    const riderFn = RIDER_TX[action];
    if (merchantFn) {
      if (!await requireMerchantOf(req, reply, order.restaurantId ?? '')) return reply;
    } else if (riderFn) {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      if (user.role !== 'rider' || order.riderId !== user.actorId) return reply.code(403).send({ error: 'ไม่ใช่งานของคุณ' });
    } else {
      return reply.code(400).send({ error: `transition ไม่รู้จัก: ${action}` });
    }

    return db.transaction(async (tx) => {
      const [cur] = await tx.select().from(schema.orders).where(eq(schema.orders.id, req.params.id));
      if (!cur) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });
      const result = (merchantFn ?? riderFn!)(cur.state as OrderState);
      if (!result.ok) return reply.code(409).send({ error: result.reason });
      await tx.update(schema.orders).set({ state: result.state }).where(eq(schema.orders.id, req.params.id));
      // ถึงปลายทาง (สำเร็จ/ส่งไม่ได้/ร้านปฏิเสธ) → ลง settlement เข้าบัญชี (idempotent; ระหว่างทางคืน null)
      const settlement = await settleOrderToLedger(tx, req.params.id, cur.restaurantId, cur.amounts as Amounts, result.state);
      return { ok: true, state: result.state, settlement };
    });
  });

  // ยกเลิกโดยแอดมิน (force-cancel) — สิทธิ์แอดมินเท่านั้น + คืนเงิน/ลงบัญชีตามที่โดเมนตัดสิน
  app.post<{ Params: { id: string } }>('/orders/:id/cancel', async (req, reply) => {
    if (!await requireAdmin(req, reply)) return reply;
    const { id } = req.params;
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id));
      if (!row) return reply.code(404).send({ error: 'ไม่พบออเดอร์' });

      const result = adminCancel(row.state as OrderState); // โดเมนตัดสิน (ออเดอร์จบแล้วยกเลิกซ้ำไม่ได้)
      if (!result.ok) return reply.code(409).send({ error: result.reason });

      await tx.update(schema.orders).set({ state: result.state }).where(eq(schema.orders.id, id));
      // CancelledByAdmin → ไม่มีรายได้ แต่คืนเต็ม + แพลตฟอร์มแบกค่าอาหาร (settle ตัดสิน) — idempotent
      const settlement = await settleOrderToLedger(tx, id, row.restaurantId, row.amounts as Amounts, result.state);
      return { ok: true, state: result.state, settlement };
    });
  });
}
