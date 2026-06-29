/**
 * บริการ auto-action ขั้นบันได (ADR 0006) — ใช้ซ้ำทั้งใน route /moderation และหลังบันทึก dispute
 * จับตา→แจ้งเตือน, ดำเนินการ→ลดอันดับ+ระงับ (idempotent ผ่าน planAutoActions)
 */
import { eq, or, inArray, sql } from 'drizzle-orm';
import { planAutoActions } from '@app/domain/dispute/dispute.js';
import type { Dispute, PartyVolume, AutoActionPlan } from '@app/domain/dispute/dispute.js';
import { schema } from '../db/index.js';
import type { Db } from '../db/index.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// ฝ่ายที่กำกับ (mirror store.MONITORED_PARTIES) — production: ดึงจากฐานบัญชี/role
export const MONITORED = ['rider:somchai', 'rider:nid', 'merchant:khao-man-kai'];

export const toDispute = (r: typeof schema.disputes.$inferSelect): Dispute => ({
  id: r.id, orderId: r.orderId, customer: r.customer, merchant: r.merchant, rider: r.rider,
  category: r.category as Dispute['category'], hasPhoto: r.hasPhoto,
  status: r.status as Dispute['status'], refund: r.refund,
});

/** ปริมาณออเดอร์จริงของฝ่าย (ตัวหารอัตราร้องเรียน) — นับจากตาราง orders */
export async function orderVolume(tx: Tx, account: string): Promise<number> {
  const merchantId = account.startsWith('merchant:') ? account.slice('merchant:'.length) : null;
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(
    or(
      eq(schema.orders.riderId, account),
      eq(schema.orders.customerId, account),
      merchantId ? eq(schema.orders.restaurantId, merchantId) : sql`false`,
    ),
  );
  return r?.n ?? 0;
}

async function ensureRow(tx: Tx, account: string): Promise<void> {
  await tx.insert(schema.moderation).values({ account }).onConflictDoNothing();
}

/** คำนวณ + ลงผล auto-action ที่ "ยังไม่ได้ทำ" ภายใน transaction ที่ส่งเข้ามา */
export async function runAutoActions(tx: Tx): Promise<AutoActionPlan> {
  const disputes = (await tx.select().from(schema.disputes)).map(toDispute);

  const parties: PartyVolume[] = [];
  for (const account of MONITORED) parties.push({ account, orders: await orderVolume(tx, account) });

  const mod = await tx.select().from(schema.moderation);
  const plan = planAutoActions(disputes, parties, {
    notified: mod.filter((m) => m.notified).map((m) => m.account),
    downranked: mod.filter((m) => m.downranked).map((m) => m.account),
    suspended: mod.filter((m) => m.suspended).map((m) => m.account),
  });

  const touched = [...new Set([...plan.notify, ...plan.downrank, ...plan.suspend])];
  for (const account of touched) await ensureRow(tx, account);
  if (plan.notify.length) await tx.update(schema.moderation).set({ notified: true }).where(inArray(schema.moderation.account, plan.notify));
  if (plan.downrank.length) await tx.update(schema.moderation).set({ downranked: true }).where(inArray(schema.moderation.account, plan.downrank));
  if (plan.suspend.length) await tx.update(schema.moderation).set({ suspended: true }).where(inArray(schema.moderation.account, plan.suspend));

  return plan;
}
