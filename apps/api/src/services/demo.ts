/**
 * Seed demo data — ออเดอร์/ร้องเรียน/อัตราคอม/ledger ตัวอย่าง ให้ตรงกับ store seed ฝั่ง web
 * คิด amounts + ledger ด้วยฟังก์ชันโดเมนชุดเดียวกับ store → ยอด wallet ตรงกันเป๊ะ
 * (transitional: ปัจจุบัน demo seed ซ้ำกับ __seed ใน store.tsx; เมื่อ cutover เต็มตัว store จะเลิก seed เอง)
 */
import { randomUUID } from 'node:crypto';
import { placeOrder } from '@app/domain/order/transitions.js';
import type { OrderState } from '@app/domain/order/state.js';
import type { OrderLine } from '@app/domain/cart/cart.js';
import { foodTotal, SERVICE_FEE } from '@app/domain/cart/cart.js';
import { haversineKm, deliveryFee } from '@app/domain/delivery/delivery.js';
import { settle } from '@app/domain/settlement/settlement.js';
import type { Amounts } from '@app/domain/settlement/settlement.js';
import { postSettlement } from '@app/domain/wallet/wallet.js';
import type { Ledger } from '@app/domain/wallet/wallet.js';
import {
  restaurants, findRestaurant, ratesFor, merchantOverrides, RATE_POLICY, CUSTOMER_LOCATION,
} from '@app/domain/catalog/catalog.js';
import { hashPassword } from '../auth/lucia.js';
import { db, schema } from '../db/index.js';
import type { Db } from '../db/index.js';
import type { PlacedOrder } from '../db/types.js';

type DemoOrder = { id: string; placed: PlacedOrder; state: OrderState; rider: string; customer: string };

const seedLines: OrderLine[] = [
  { id: 'd1', itemName: 'ข้าวมันไก่ต้ม', basePrice: 50, spice: 'เผ็ดน้อย', options: [{ label: 'เพิ่มไข่ต้ม', price: 10 }], qty: 2, note: 'ไม่ใส่ผักชี' },
  { id: 'd2', itemName: 'ข้าวมันไก่ทอด', basePrice: 55, spice: 'เผ็ดกลาง', options: [{ label: 'ไก่พิเศษ', price: 15 }], qty: 1, note: '' },
];

// ออเดอร์ตัวอย่าง (กำลังดำเนิน 2 + จบแล้ว 2) — เหมือน __orders ใน store.tsx
const demoOrders: DemoOrder[] = [
  { id: '1042', placed: { restaurantId: 'khao-man-kai', lines: seedLines }, state: placeOrder(), rider: 'rider:somchai', customer: 'customer:aon' },
  { id: '1041', placed: { restaurantId: 'kuaytiao-ruea', lines: [
    { id: 'o41', itemName: 'ก๋วยเตี๋ยวเรือหมู', basePrice: 45, spice: 'เผ็ดกลาง', options: [], qty: 2, note: '' },
  ] }, state: { kind: 'InTransit', rider: 'Delivering' }, rider: 'rider:nid', customer: 'customer:aon' },
  { id: '1039', placed: { restaurantId: 'cha-maimuk', lines: [
    { id: 'o39', itemName: 'ชาไทยไข่มุก', basePrice: 45, spice: '', options: [], qty: 1, note: '' },
  ] }, state: { kind: 'Completed' }, rider: 'rider:somchai', customer: 'customer:aon' },
  { id: '1038', placed: { restaurantId: 'somtam', lines: [
    { id: 'o38', itemName: 'ตำไทย', basePrice: 40, spice: '', options: [], qty: 1, note: '' },
  ] }, state: { kind: 'FailedDelivery' }, rider: 'rider:somchai', customer: 'customer:nok' },
];

// อัตราคอมที่เจรจาแล้วเริ่มต้น = ตามนโยบาย seed (เช่น cha-maimuk 20%) — เหมือน __rateOverrides
const demoOverrides: Record<string, number> = Object.fromEntries(
  Object.entries(RATE_POLICY.byMerchant ?? {}).map(([id, ov]) => [id, ov.commissionRate ?? RATE_POLICY.base.commissionRate]),
);

const merchantAccount = (placed: PlacedOrder): string => `merchant:${placed.restaurantId ?? 'unknown'}`;

function amountsOf(placed: PlacedOrder): Amounts {
  const r = findRestaurant(restaurants, placed.restaurantId ?? undefined);
  const food = foodTotal({ lines: placed.lines });
  const delivery = r ? deliveryFee(haversineKm(CUSTOMER_LOCATION, r.coord)) : 0;
  return { food, delivery, service: SERVICE_FEE };
}

/** ลงบัญชีของออเดอร์ที่จบแล้วเข้า ledger (อัตราต่อร้าน/โซนที่เจรจา) — เหมือน postOrder ใน store */
function postOrder(ledger: Ledger, o: DemoOrder): Ledger {
  const r = findRestaurant(restaurants, o.placed.restaurantId ?? undefined);
  const s = settle(o.state, amountsOf(o.placed), ratesFor(r, merchantOverrides(demoOverrides)));
  return s ? postSettlement(ledger, o.id, merchantAccount(o.placed), s) : ledger;
}

const demoDisputes = [
  { id: 'dp1', orderId: '1039', customer: 'customer:aon', merchant: 'merchant:cha-maimuk',
    rider: 'rider:somchai', category: 'wrong_item', hasPhoto: true, status: 'open', refund: 0 },
];

/** Seed orders/disputes/rate_overrides/ledger ตัวอย่าง (idempotent: ล้างก่อนใส่) */
export async function seedDemo(conn: Db = db): Promise<{ orders: number; disputes: number; ledger: number }> {
  return conn.transaction(async (tx) => {
    await tx.delete(schema.ledgerEntries);
    await tx.delete(schema.disputes);
    await tx.delete(schema.rateOverrides);
    await tx.delete(schema.moderation); // baseline = ไม่มีการพักงาน/ลดอันดับ
    await tx.delete(schema.orders);

    for (const o of demoOrders) {
      await tx.insert(schema.orders).values({
        id: o.id, restaurantId: o.placed.restaurantId, riderId: o.rider, customerId: o.customer,
        placed: o.placed, amounts: amountsOf(o.placed), state: o.state,
      });
    }
    await tx.insert(schema.disputes).values(demoDisputes);
    await tx.insert(schema.rateOverrides).values(
      Object.entries(demoOverrides).map(([merchantId, commissionRate]) => ({ merchantId, commissionRate })),
    );

    const ledger = demoOrders.reduce<Ledger>((l, o) => postOrder(l, o), []);
    if (ledger.length > 0) {
      await tx.insert(schema.ledgerEntries).values(
        ledger.map((e) => ({ id: randomUUID(), account: e.account, amount: e.amount, kind: e.kind, orderId: e.orderId, memo: e.memo })),
      );
    }
    return { orders: demoOrders.length, disputes: demoDisputes.length, ledger: ledger.length };
  });
}

// ผู้ใช้เดโม (จริงมาจากการสมัคร) — รหัสผ่านเดียวกันทั้งหมดเพื่อทดสอบ
const DEMO_PASSWORD = 'demo1234';
const demoUsers = [
  { actorId: 'customer:aon', role: 'customer' },
  { actorId: 'merchant:khao-man-kai', role: 'merchant' },
  { actorId: 'rider:somchai', role: 'rider' },
  { actorId: 'admin:root', role: 'admin' },
];

/** Seed ผู้ใช้เดโม (idempotent: ล้าง sessions ก่อน แล้ว users) — รหัสผ่าน 'demo1234' */
export async function seedUsers(conn: Db = db): Promise<{ users: number; password: string }> {
  return conn.transaction(async (tx) => {
    await tx.delete(schema.sessions); // FK → users ต้องล้างก่อน
    await tx.delete(schema.users);
    await tx.insert(schema.users).values(
      demoUsers.map((u) => ({ id: randomUUID(), actorId: u.actorId, role: u.role, passwordHash: hashPassword(DEMO_PASSWORD) })),
    );
    return { users: demoUsers.length, password: DEMO_PASSWORD };
  });
}
