import { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { emptyCart, addLine, removeLine, setLineQty, foodTotal, SERVICE_FEE } from '@app/domain/cart/cart.js';
import type { Cart, OrderLine } from '@app/domain/cart/cart.js';
import { placeOrder, adminCancel, claimJob } from '@app/domain/order/transitions.js';
import type { OrderState } from '@app/domain/order/state.js';
import { suspend, unsuspend, isSuspended } from '@app/domain/moderation/moderation.js';
import { haversineKm, deliveryFee } from '@app/domain/delivery/delivery.js';
import { settle } from '@app/domain/settlement/settlement.js';
import { postSettlement, postGoodwill, payout, runSettlement } from '@app/domain/wallet/wallet.js';
import type { LedgerEntry, Ledger } from '@app/domain/wallet/wallet.js';
import { fileComplaint, resolveGoodwill, reject as rejectDispute, planAutoActions } from '@app/domain/dispute/dispute.js';
import type { Dispute, DisputeCategory } from '@app/domain/dispute/dispute.js';
import { requestRate, approveRate, rejectRate, counterRate, acceptCounter, declineCounter, agreedRate } from '@app/domain/revenue/revenue.js';
import type { RateRequest } from '@app/domain/revenue/revenue.js';
import { addItem, updateItem, removeItem } from '@app/domain/menu/menu.js';
import type { ItemFields } from '@app/domain/menu/menu.js';
import { restaurants as seedRestaurants, findRestaurant, ratesFor, merchantOverrides, RATE_POLICY, CUSTOMER_LOCATION } from './data/catalog';
import type { Dish, Restaurant } from './data/catalog';
import { getRestaurants, getOrders, getDisputes, getRateRequests, getModeration, getLedger, getRateOverrides } from '../api/client';
import {
  cancelOrder, resolveDispute as apiResolveDispute, suspendActor, unsuspendActor, runSettlement as apiRunSettlement,
  approveRateRequest as apiApproveRate, rejectRateRequest as apiRejectRate, counterRateRequest as apiCounterRate,
  acceptCounterOffer as apiAcceptCounter, declineCounterOffer as apiDeclineCounter,
  login as apiLogin, logout as apiLogout, me as apiMe, submitRateRequest as apiSubmitRate,
  createOrder as apiCreateOrder, completeOrder as apiCompleteOrder, fileDispute as apiFileDispute,
  addMenuItem as apiAddMenu, updateMenuItem as apiUpdateMenu, removeMenuItem as apiRemoveMenu,
  claimOrder as apiClaimOrder, transitionOrder as apiTransitionOrder,
} from '../api/client';
import type { ApiOrder, ApiModeration, AuthUser, SubmitRateInput, CreateOrderInput, FileDisputeInput } from '../api/client';

// สแนปช็อตสิ่งที่ลูกค้าสั่ง ณ ตอนจ่ายเงิน — OrderState เป็น state machine ล้วน ไม่ถือเมนู
// ฝั่งร้าน/ไรเดอร์จึงอ้างจากตรงนี้เพื่อรู้ว่าออเดอร์นี้คือเมนูอะไร ร้านไหน
export type PlacedOrder = { restaurantId: string | null; lines: OrderLine[] };

// ออเดอร์ในมุมมองแอดมิน (หลายออเดอร์พร้อมกัน) — id + สแนปช็อตเมนู + สถานะ state machine
// rider/customer = ฝ่ายที่เกี่ยวข้องกับออเดอร์นี้ ใช้เป็น "ปริมาณออเดอร์จริง" ของอัตราร้องเรียน (ADR 0006)
export type AdminOrder = {
  id: string;
  placed: PlacedOrder;
  state: OrderState;
  rider?: string;
  customer?: string;
};

// ออเดอร์หนึ่งต้องมาจากร้านเดียว (CONTEXT.md: Order) — ตะกร้าจึงผูกกับ restaurantId เดียว
export type State = {
  cart: Cart;
  restaurantId: string | null;
  order: OrderState | null;
  placed: PlacedOrder | null;
  // เมนูร้านทั้งหมด — แหล่งความจริงเดียวที่ทั้งฝั่งลูกค้าและฝั่งร้านอ่าน/แก้ (seed จาก catalog)
  restaurants: Restaurant[];
  // มุมมองแอดมิน: รายการออเดอร์ในระบบ + ผลของ auto-action ขั้นบันได (ADR 0006)
  orders: AdminOrder[];
  suspended: string[];   // ระงับ (ระดับ "ดำเนินการ")
  downranked: string[];  // ลดอันดับ (ระดับ "ดำเนินการ")
  notified: string[];    // แจ้งเตือนแล้ว (ระดับ "จับตา" ขึ้นไป)
  // Wallet ภายใน (ADR 0004): บัญชีแยกประเภท append-only ของเงินที่เครดิต/คืน/จ่ายออก
  ledger: LedgerEntry[];
  // ร้องเรียนหลังส่ง (ADR 0006): flow นอกวงจรชีวิตออเดอร์ เกิดหลัง Completed
  disputes: Dispute[];
  // อัตราคอมที่เจรจาแล้วต่อร้าน (ADR 0003): merchantId → commissionRate; คำขอปรับอัตราที่รออนุมัติ
  rateOverrides: Record<string, number>;
  rateRequests: RateRequest[];
  // ผู้ใช้ที่ล็อกอิน (Lucia session) — null/ไม่มี = ยังไม่ล็อกอิน; แทนตัวตนฮาร์ดโค้ดเดิมเมื่อมีค่า
  // optional: เทสต์ที่สร้าง State เองไม่ต้องระบุ (ถือว่ายังไม่ล็อกอิน)
  auth?: AuthUser | null;
  // id ของออเดอร์สดฝั่ง server (ตั้งหลัง place mirror) — ใช้ร้องเรียนกับออเดอร์จริง; null/ไม่มี = ยังไม่ persist
  liveOrderId?: string | null;
  // ไรเดอร์ที่คว้างานออเดอร์สด (pull-based dispatch ADR 0001) — ตั้งตอน claim; null/ไม่มี = ยังไม่มีใครคว้า
  liveRider?: string | null;
  // ข้อความแจ้งผู้ใช้ชั่วคราว (เช่น mirror ไป backend ล้มเหลว/ต้องล็อกอิน) — null/ไม่มี = ไม่มีแจ้ง
  notice?: string | null;
};

// ไรเดอร์ที่ล็อกอินอยู่ฝั่ง rider console — จาก session ถ้าล็อกอินเป็น rider ไม่งั้น fallback เดโม
export function riderActorId(state: State): string {
  return state.auth?.role === 'rider' ? state.auth.actorId : LIVE_RIDER;
}

// ร้านที่ "ผู้ใช้ฝั่งร้าน" เป็นเจ้าของ (เดโม fallback เมื่อยังไม่ล็อกอิน) — ใช้ในหน้าฝั่งร้าน
export const MERCHANT_RESTAURANT_ID = 'khao-man-kai';

/** ร้านของผู้ใช้ฝั่งร้าน — จาก session ถ้าล็อกอินเป็น merchant (actorId `merchant:<id>`), ไม่งั้น fallback เดโม */
export function merchantRestaurantId(state: State): string {
  return state.auth?.role === 'merchant' ? state.auth.actorId.replace(/^merchant:/, '') : MERCHANT_RESTAURANT_ID;
}

// ตัวตนลูกค้าในเดโม (จริงมาจากเซสชันล็อกอิน) — ใช้ตอนยื่นร้องเรียนจากออเดอร์สด
export const CUSTOMER_ID = 'customer:aon';
// ไรเดอร์ของออเดอร์สด (สอดคล้องกับคอนโซลไรเดอร์) — ออเดอร์สดไม่ได้ผูกตัวไรเดอร์ไว้ จึงใช้ค่านี้
const LIVE_RIDER = 'rider:somchai';

// ฝ่ายที่แอดมินกำกับ — เป็นฐานของ auto-suspend (ADR 0006); ปริมาณออเดอร์คิดจากข้อมูลจริง (orderVolume)
export const MONITORED_PARTIES = [
  { id: 'rider:somchai', name: 'สมชาย (ไรเดอร์)', icon: '🛵' },
  { id: 'rider:nid', name: 'นิด (ไรเดอร์)', icon: '🛵' },
  { id: 'merchant:khao-man-kai', name: 'ข้าวมันไก่ตำนาน (ร้าน)', icon: '🏪' },
];

/** ปริมาณออเดอร์จริงที่ฝ่ายนี้เกี่ยวข้อง (ร้าน/ไรเดอร์/ลูกค้า) — ตัวหารของอัตราร้องเรียน */
export function orderVolume(orders: readonly AdminOrder[], account: string): number {
  return orders.reduce(
    (n, o) => (merchantAccount(o.placed) === account || o.rider === account || o.customer === account ? n + 1 : n),
    0,
  );
}

/** ปิดคำขออัตราเป็น approved + อัปเดต override ด้วยอัตราที่ตกลง (ที่ขอ หรือข้อเสนอแย้ง) */
function applyApprovedRate(s: State, request: RateRequest): State {
  const rateRequests = s.rateRequests.map((q) => (q.id === request.id ? request : q));
  const rateOverrides = { ...s.rateOverrides, [request.merchantId]: agreedRate(request) };
  return { ...s, rateRequests, rateOverrides };
}

/**
 * auto-action ขั้นบันไดตามสถิติร้องเรียน (ADR 0006) — เรียกหลังทุกการแก้ disputes
 * จับตา → แจ้งเตือน; ดำเนินการ → ลดอันดับ + ระงับ (ทำเฉพาะที่ยังไม่ได้ทำ; one-directional)
 */
function applyAutoActions(s: State): State {
  const volumes = MONITORED_PARTIES.map((p) => ({ account: p.id, orders: orderVolume(s.orders, p.id) }));
  const plan = planAutoActions(s.disputes, volumes, { notified: s.notified, downranked: s.downranked, suspended: s.suspended });
  if (plan.notify.length === 0 && plan.downrank.length === 0 && plan.suspend.length === 0) return s;
  return {
    ...s,
    notified: [...s.notified, ...plan.notify],
    downranked: [...s.downranked, ...plan.downrank],
    suspended: plan.suspend.reduce((list, acc) => [...suspend(list, acc)], s.suspended),
  };
}

// ── ตัวช่วยคิดยอด/บัญชี wallet จากออเดอร์ ──
const merchantAccount = (placed: PlacedOrder): string => `merchant:${placed.restaurantId ?? 'unknown'}`;

function orderAmounts(restaurants: Restaurant[], placed: PlacedOrder): { food: number; delivery: number; service: number } {
  const r = findRestaurant(restaurants, placed.restaurantId ?? undefined);
  const food = foodTotal({ lines: placed.lines });
  const delivery = r ? deliveryFee(haversineKm(CUSTOMER_LOCATION, r.coord)) : 0;
  return { food, delivery, service: SERVICE_FEE };
}

/** ลงบัญชีของออเดอร์หนึ่งเข้า ledger (ถ้าจบแล้ว) — ใช้อัตราของร้านนั้น (override ต่อร้าน/โซน ที่เจรจาแล้ว) */
function postOrder(ledger: Ledger, restaurants: Restaurant[], overrides: Record<string, number>, o: AdminOrder): Ledger {
  const r = findRestaurant(restaurants, o.placed.restaurantId ?? undefined);
  const s = settle(o.state, orderAmounts(restaurants, o.placed), ratesFor(r, merchantOverrides(overrides)));
  return s ? postSettlement(ledger, o.id, merchantAccount(o.placed), s) : ledger;
}

type Action =
  | { type: 'add'; line: OrderLine; restaurantId: string }          // ร้านเดียวกับตะกร้า (UI ตรวจด้วย tryAddLine แล้ว)
  | { type: 'startNewCart'; line: OrderLine; restaurantId: string }  // สั่งข้ามร้าน หลังผู้ใช้ยืนยัน → เริ่มตะกร้าใหม่
  | { type: 'remove'; id: string }
  | { type: 'qty'; id: string; qty: number }
  | { type: 'place' }           // สร้างออเดอร์จากตะกร้า แล้วล้างตะกร้า
  | { type: 'setOrder'; order: OrderState; txn?: string } // txn = ชื่อ transition (ราง ร้าน/ไรเดอร์) สำหรับ mirror ไป server
  | { type: 'reset' }           // เริ่มออเดอร์ใหม่ (เดโม)
  | { type: 'resetApp' }        // รีเซ็ตทั้งแอปกลับเป็น seed (คู่กับล้างข้อมูลที่ persist)
  | { type: 'hydrate'; patch: Partial<State> } // เติม state จาก backend (cutover: read จาก API แทน seed)
  | { type: 'setAuth'; user: AuthUser | null }  // ตั้ง/ล้างผู้ใช้ที่ล็อกอิน (Lucia session)
  | { type: 'setNotice'; text: string | null }  // ข้อความแจ้งผู้ใช้ชั่วคราว (mirror ล้ม/ต้องล็อกอิน)
  // ── จัดการเมนูฝั่งร้าน (ใช้โดเมน menu CRUD; no-op ถ้าโดเมนปฏิเสธ) ──
  | { type: 'menuAddDish'; restaurantId: string; dish: Dish }
  | { type: 'menuUpdateDish'; restaurantId: string; dishId: string; fields: ItemFields }
  | { type: 'menuRemoveDish'; restaurantId: string; dishId: string }
  // ── แอดมินกำกับดูแล ──
  | { type: 'adminCancelOrder'; id: string }
  | { type: 'toggleSuspend'; actor: string }
  | { type: 'walletPayout'; account: string }
  | { type: 'walletRunSettlement' } // รันรอบ settlement: จ่ายทุกบัญชีที่ถึงยอดถอนขั้นต่ำ
  // ── ร้องเรียนหลังส่ง (ADR 0006) ──
  | { type: 'fileDispute'; category: DisputeCategory; hasPhoto: boolean } // ลูกค้ายื่นจากออเดอร์สด
  | { type: 'resolveDispute'; id: string; amount: number }                // แอดมินคืน goodwill
  | { type: 'rejectDispute'; id: string }                                 // แอดมินปฏิเสธ (สงสัยโกง)
  // ── เจรจาอัตราคอมสองทาง (ADR 0003) ──
  | { type: 'submitRateRequest'; merchantId: string; currentRate: number; proposedRate: number; reason: string } // ร้านยื่น
  | { type: 'reconcileRateRequest'; localId: string; request: RateRequest } // adopt entity จาก server (แทน local id)
  | { type: 'claimLive'; rider: string; riderSuspended: boolean; priorityHeld: boolean } // ไรเดอร์คว้างานออเดอร์สด
  | { type: 'reconcileLiveOrder'; id: string }                  // ตั้ง id ออเดอร์สดจาก server (หลัง place)
  | { type: 'reconcileDispute'; localId: string; dispute: Dispute } // adopt ร้องเรียนจาก server (แทน local id)
  | { type: 'approveRateRequest'; id: string }            // แอดมินอนุมัติ → อัปเดต rateOverrides
  | { type: 'rejectRateRequest'; id: string }             // แอดมินปฏิเสธ
  | { type: 'counterRateRequest'; id: string; counter: number } // แอดมินเสนอแย้ง
  | { type: 'acceptCounterOffer'; id: string }            // ร้านตอบรับข้อเสนอแย้ง → อัปเดต rateOverrides
  | { type: 'declineCounterOffer'; id: string };          // ร้านปฏิเสธข้อเสนอแย้ง

/** อัปเดต dishes ของร้านหนึ่งด้วยฟังก์ชันโดเมน — ถ้าโดเมนปฏิเสธ คงของเดิม */
function mapDishes(s: State, restaurantId: string, fn: (dishes: readonly Dish[]) => { ok: boolean; items?: readonly Dish[] }): State {
  const restaurants = s.restaurants.map((r) => {
    if (r.id !== restaurantId) return r;
    const res = fn(r.dishes);
    return res.ok && res.items ? { ...r, dishes: [...res.items] } : r;
  });
  return { ...s, restaurants };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'add':
      return { ...s, cart: addLine(s.cart, a.line), restaurantId: a.restaurantId };
    case 'startNewCart':
      return { ...s, cart: addLine(emptyCart(), a.line), restaurantId: a.restaurantId };
    case 'remove': {
      const cart = removeLine(s.cart, a.id);
      return { ...s, cart, restaurantId: cart.lines.length === 0 ? null : s.restaurantId };
    }
    case 'qty': return { ...s, cart: setLineQty(s.cart, a.id, a.qty) };
    case 'place':
      return {
        ...s,
        cart: emptyCart(),
        restaurantId: null,
        order: placeOrder(),
        placed: { restaurantId: s.restaurantId, lines: s.cart.lines },
        liveOrderId: null, // รอ server คืน id (mirror place → reconcileLiveOrder)
      };
    case 'setOrder': {
      const order = a.order;
      // ออเดอร์สด "สำเร็จ" ครั้งแรก → บันทึกเข้าประวัติ (ปริมาณออเดอร์จริงของฝ่ายโตขึ้น) + ลงบัญชี
      if (order.kind === 'Completed' && s.order?.kind !== 'Completed' && s.placed) {
        const record: AdminOrder = {
          id: `LV${s.orders.length + 1}`, placed: s.placed, state: order,
          rider: s.liveRider ?? LIVE_RIDER, customer: s.auth?.actorId ?? CUSTOMER_ID,
        };
        const ledger = [...postOrder(s.ledger, s.restaurants, s.rateOverrides, record)];
        return { ...s, order, orders: [...s.orders, record], ledger };
      }
      return { ...s, order };
    }
    case 'reset': return { ...s, order: placeOrder() };
    case 'resetApp': return __seed;
    case 'hydrate': return { ...s, ...a.patch };
    case 'setAuth': return { ...s, auth: a.user };
    case 'setNotice': return { ...s, notice: a.text };
    case 'menuAddDish': return mapDishes(s, a.restaurantId, (d) => addItem(d, a.dish));
    case 'menuUpdateDish': return mapDishes(s, a.restaurantId, (d) => updateItem(d, a.dishId, a.fields));
    case 'menuRemoveDish': return mapDishes(s, a.restaurantId, (d) => removeItem(d, a.dishId));
    case 'adminCancelOrder': {
      const target = s.orders.find((o) => o.id === a.id);
      if (!target) return s;
      const r = adminCancel(target.state);
      if (!r.ok) return s;
      const cancelled = { ...target, state: r.state };
      const orders = s.orders.map((o) => (o.id === a.id ? cancelled : o));
      // ยกเลิกแล้วออเดอร์จบ → ลงบัญชี wallet (คืนลูกค้า + แพลตฟอร์มแบกค่าอาหาร)
      const ledger = [...postOrder(s.ledger, s.restaurants, s.rateOverrides, cancelled)];
      return { ...s, orders, ledger };
    }
    case 'toggleSuspend':
      return {
        ...s,
        suspended: isSuspended(s.suspended, a.actor)
          ? [...unsuspend(s.suspended, a.actor)]
          : [...suspend(s.suspended, a.actor)],
      };
    case 'walletPayout':
      return { ...s, ledger: [...payout(s.ledger, a.account)] };
    case 'walletRunSettlement':
      return { ...s, ledger: [...runSettlement(s.ledger)] };
    case 'fileDispute': {
      // ยื่นได้เฉพาะออเดอร์สดที่ส่งสำเร็จแล้ว (โดเมนตรวจ orderKind/หน้าต่าง/รูปอีกชั้น)
      if (!s.order || !s.placed) return s;
      const r = fileComplaint(
        {
          id: `dp${s.disputes.length + 1}`,
          orderId: 'สด',
          customer: s.auth?.actorId ?? CUSTOMER_ID, // ตัวตนจาก session ถ้าล็อกอิน ไม่งั้น fallback เดโม
          merchant: merchantAccount(s.placed),
          rider: s.liveRider ?? LIVE_RIDER, // ไรเดอร์ที่คว้างาน (ถ้ามี) ไม่งั้น fallback เดโม
          category: a.category,
          hasPhoto: a.hasPhoto,
        },
        { orderKind: s.order.kind, minutesSinceCompleted: 0 },
      );
      return r.ok ? applyAutoActions({ ...s, disputes: [...s.disputes, r.dispute] }) : s;
    }
    case 'resolveDispute': {
      const target = s.disputes.find((d) => d.id === a.id);
      if (!target) return s;
      const r = resolveGoodwill(target, a.amount);
      if (!r.ok) return s;
      const disputes = s.disputes.map((d) => (d.id === a.id ? r.dispute : d));
      // goodwill: แพลตฟอร์มคืนจากกระเป๋าตัวเอง → ลงบัญชี wallet
      const ledger = [...postGoodwill(s.ledger, r.dispute.id, a.amount)];
      return applyAutoActions({ ...s, disputes, ledger });
    }
    case 'rejectDispute': {
      const target = s.disputes.find((d) => d.id === a.id);
      if (!target) return s;
      const r = rejectDispute(target);
      if (!r.ok) return s;
      return applyAutoActions({ ...s, disputes: s.disputes.map((d) => (d.id === a.id ? r.dispute : d)) });
    }
    case 'submitRateRequest': {
      const r = requestRate({
        id: `rr${s.rateRequests.length + 1}`,
        merchantId: a.merchantId, currentRate: a.currentRate, proposedRate: a.proposedRate, reason: a.reason,
      });
      return r.ok ? { ...s, rateRequests: [...s.rateRequests, r.request] } : s;
    }
    case 'reconcileRateRequest': // แทนคำขอ local ด้วย entity จริงจาก server (id ตรงกับ DB)
      return { ...s, rateRequests: s.rateRequests.map((q) => (q.id === a.localId ? a.request : q)) };
    case 'claimLive': {
      // ไรเดอร์คว้างานออเดอร์สด (Unclaimed→Claimed) — โดเมนตรวจพักงาน/ช่วงให้สิทธิ์อันดับสูง
      if (!s.order) return s;
      const r = claimJob(s.order, { riderSuspended: a.riderSuspended, priorityHeld: a.priorityHeld });
      return r.ok ? { ...s, order: r.state, liveRider: a.rider } : s;
    }
    case 'reconcileLiveOrder': return { ...s, liveOrderId: a.id };
    case 'reconcileDispute': // แทนร้องเรียน local ด้วย entity จริงจาก server
      return { ...s, disputes: s.disputes.map((d) => (d.id === a.localId ? a.dispute : d)) };
    case 'approveRateRequest': {
      const target = s.rateRequests.find((q) => q.id === a.id);
      if (!target) return s;
      const r = approveRate(target);
      return r.ok ? applyApprovedRate(s, r.request) : s;
    }
    case 'rejectRateRequest': {
      const target = s.rateRequests.find((q) => q.id === a.id);
      if (!target) return s;
      const r = rejectRate(target);
      if (!r.ok) return s;
      return { ...s, rateRequests: s.rateRequests.map((q) => (q.id === a.id ? r.request : q)) };
    }
    case 'counterRateRequest': {
      const target = s.rateRequests.find((q) => q.id === a.id);
      if (!target) return s;
      const r = counterRate(target, a.counter);
      if (!r.ok) return s;
      return { ...s, rateRequests: s.rateRequests.map((q) => (q.id === a.id ? r.request : q)) };
    }
    case 'acceptCounterOffer': {
      const target = s.rateRequests.find((q) => q.id === a.id);
      if (!target) return s;
      const r = acceptCounter(target);
      return r.ok ? applyApprovedRate(s, r.request) : s;
    }
    case 'declineCounterOffer': {
      const target = s.rateRequests.find((q) => q.id === a.id);
      if (!target) return s;
      const r = declineCounter(target);
      if (!r.ok) return s;
      return { ...s, rateRequests: s.rateRequests.map((q) => (q.id === a.id ? r.request : q)) };
    }
    default: return s;
  }
}

type StoreValue = {
  state: State;
  dispatch: Dispatch<Action>;
  login: (actorId: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};
const Ctx = createContext<StoreValue | null>(null);

const __seedLines: OrderLine[] = [
  { id: 'd1', itemName: 'ข้าวมันไก่ต้ม', basePrice: 50, spice: 'เผ็ดน้อย', options: [{ label: 'เพิ่มไข่ต้ม', price: 10 }], qty: 2, note: 'ไม่ใส่ผักชี' },
  { id: 'd2', itemName: 'ข้าวมันไก่ทอด', basePrice: 55, spice: 'เผ็ดกลาง', options: [{ label: 'ไก่พิเศษ', price: 15 }], qty: 1, note: '' },
];

// ออเดอร์ตัวอย่างหลายสถานะ สำหรับมุมมองแอดมิน (กำลังดำเนิน 2 + จบแล้ว 2) — มีฝ่ายที่เกี่ยวข้องครบ
const __orders: AdminOrder[] = [
  { id: '1042', placed: { restaurantId: 'khao-man-kai', lines: __seedLines }, state: placeOrder(),
    rider: 'rider:somchai', customer: 'customer:aon' },
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

// อัตราคอมที่เจรจาแล้วเริ่มต้น = ตามนโยบาย seed (เช่น cha-maimuk 20%)
const __rateOverrides: Record<string, number> = Object.fromEntries(
  Object.entries(RATE_POLICY.byMerchant ?? {}).map(([id, ov]) => [id, ov.commissionRate ?? RATE_POLICY.base.commissionRate]),
);

// ledger เริ่มต้น = ลงบัญชีออเดอร์ที่จบแล้วใน seed (สำเร็จ/ส่งไม่ได้)
const __ledger: LedgerEntry[] = [...__orders.reduce<Ledger>(
  (l, o) => postOrder(l, seedRestaurants, __rateOverrides, o), [],
)];

// ร้องเรียนค้างรอแอดมินจัดการ (ผูกกับออเดอร์ #1039 ที่ส่งสำเร็จแล้ว)
const __disputes: Dispute[] = [
  { id: 'dp1', orderId: '1039', customer: 'customer:aon', merchant: 'merchant:cha-maimuk',
    rider: 'rider:somchai', category: 'wrong_item', hasPhoto: true, status: 'open', refund: 0 },
];

const __seed: State = {
  cart: { lines: __seedLines },
  restaurantId: 'khao-man-kai',
  order: placeOrder(),
  // seed มีออเดอร์ตัวอย่างกำลังดำเนินอยู่ → คอนโซลร้านเห็นออเดอร์นี้ทันที
  placed: { restaurantId: 'khao-man-kai', lines: __seedLines },
  restaurants: seedRestaurants,
  orders: __orders,
  suspended: [],
  downranked: [],
  notified: [],
  ledger: __ledger,
  disputes: __disputes,
  rateOverrides: __rateOverrides,
  rateRequests: [],
  auth: null,
};

// คีย์เก็บ state ทั้งก้อนใน localStorage (เปิดใช้เมื่อ persist=true เท่านั้น — เทสต์จึงไม่แตะ)
const LS_STATE = 'food-app.state';
// เวอร์ชันโครง state — ถ้าโครงเปลี่ยนใหญ่ บัมป์เลขนี้เพื่อทิ้งข้อมูลเก่าที่เข้ากันไม่ได้
const STATE_VERSION = 1;

/** โหลด state ที่บันทึกไว้ — ตรวจเวอร์ชัน, merge ทับ seed (ฟิลด์ใหม่มีค่าตั้งต้น), พังก็คืน seed */
function loadPersisted(): State {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return __seed;
    const parsed = JSON.parse(raw) as { v?: number; s?: Partial<State> };
    if (parsed.v !== STATE_VERSION || !parsed.s) return __seed; // เวอร์ชันไม่ตรง → เริ่มใหม่
    return { ...__seed, ...parsed.s };
  } catch {
    return __seed; // ข้อมูลเสีย/parse ไม่ได้ → เริ่มจาก seed
  }
}

/** ล้างข้อมูลที่บันทึกไว้ใน localStorage (ใช้คู่กับ action 'resetApp' เพื่อรีเซ็ตเป็น seed) */
export function clearPersistedState(): void {
  try { localStorage.removeItem(LS_STATE); } catch { /* ปิด/ไม่รองรับ */ }
}

// แหล่งข้อมูล read ฝั่ง backend (cutover) — inject ได้ในเทสต์; ดีฟอลต์ = API client จริง
// Partial: เทสต์ inject เฉพาะบางตัวได้ (effect ดึงเฉพาะที่มี)
export type HydrateSource = Partial<{
  getRestaurants: () => Promise<Restaurant[]>;
  getOrders: () => Promise<ApiOrder[]>;
  getDisputes: () => Promise<Dispute[]>;
  getRateRequests: () => Promise<RateRequest[]>;
  getModeration: () => Promise<ApiModeration[]>;
  getLedger: () => Promise<LedgerEntry[]>;
  getRateOverrides: () => Promise<Record<string, number>>;
}>;
const liveSource: HydrateSource = { getRestaurants, getOrders, getDisputes, getRateRequests, getModeration, getLedger, getRateOverrides };

// ── adapter: API shape → state shape ──
/** ApiOrder → AdminOrder (rider/customer ใส่เฉพาะเมื่อมีค่า ตาม exactOptionalPropertyTypes) */
function toAdminOrders(api: readonly ApiOrder[]): AdminOrder[] {
  return api.map((o) => ({
    id: o.id, placed: o.placed, state: o.state,
    ...(o.riderId ? { rider: o.riderId } : {}),
    ...(o.customerId ? { customer: o.customerId } : {}),
  }));
}

/** ApiModeration[] (per-account booleans) → 3 ลิสต์บัญชีของ state */
function toModeration(rows: readonly ApiModeration[]): Pick<State, 'suspended' | 'downranked' | 'notified'> {
  return {
    suspended: rows.filter((m) => m.suspended).map((m) => m.account),
    downranked: rows.filter((m) => m.downranked).map((m) => m.account),
    notified: rows.filter((m) => m.notified).map((m) => m.account),
  };
}

// ── write path (cutover slice 3): mirror mutation ไป backend ──
// ชุดฟังก์ชัน write ที่ใช้ (inject ได้ในเทสต์); ดีฟอลต์ = client จริง
export type MutationSource = {
  cancelOrder: (id: string) => Promise<unknown>;
  resolveDispute: (id: string, amount: number) => Promise<unknown>;
  suspendActor: (account: string) => Promise<unknown>;
  unsuspendActor: (account: string) => Promise<unknown>;
  runSettlement: () => Promise<unknown>;
  approveRateRequest: (id: string) => Promise<unknown>;
  rejectRateRequest: (id: string) => Promise<unknown>;
  counterRateRequest: (id: string, counter: number) => Promise<unknown>;
  acceptCounterOffer: (id: string) => Promise<unknown>;
  declineCounterOffer: (id: string) => Promise<unknown>;
  submitRateRequest: (input: SubmitRateInput) => Promise<RateRequest>; // create → คืน entity ที่มี server id
  createOrder: (input: CreateOrderInput) => Promise<{ id: string }>;   // วางออเดอร์สด → คืน id
  completeOrder: (id: string) => Promise<unknown>;                     // ดันสถานะ Completed (ปลดล็อกร้องเรียน)
  fileDispute: (input: FileDisputeInput) => Promise<{ dispute: Dispute }>; // ร้องเรียน → คืน entity ที่มี server id
  addMenuItem: (restaurantId: string, dish: Dish) => Promise<unknown>;          // เมนู CRUD (dish id ฝั่ง client เสถียร ไม่ต้อง adopt)
  updateMenuItem: (restaurantId: string, dishId: string, fields: ItemFields) => Promise<unknown>;
  removeMenuItem: (restaurantId: string, dishId: string) => Promise<unknown>;
  claimOrder: (id: string) => Promise<unknown>;                                // ไรเดอร์ (session) คว้างาน → assign riderId ฝั่ง server
  transitionOrder: (id: string, action: string) => Promise<unknown>;           // เดิน state machine (ราง ร้าน/ไรเดอร์)
};
const liveMutations: MutationSource = {
  cancelOrder, resolveDispute: apiResolveDispute, suspendActor, unsuspendActor, runSettlement: apiRunSettlement,
  approveRateRequest: apiApproveRate, rejectRateRequest: apiRejectRate, counterRateRequest: apiCounterRate,
  acceptCounterOffer: apiAcceptCounter, declineCounterOffer: apiDeclineCounter, submitRateRequest: apiSubmitRate,
  createOrder: apiCreateOrder, completeOrder: apiCompleteOrder, fileDispute: apiFileDispute,
  addMenuItem: apiAddMenu, updateMenuItem: apiUpdateMenu, removeMenuItem: apiRemoveMenu, claimOrder: apiClaimOrder,
  transitionOrder: apiTransitionOrder,
};

// auth client (login/logout/me) — inject ได้ในเทสต์; ดีฟอลต์ = client จริง
export type AuthClient = {
  login: (actorId: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<unknown>;
  me: () => Promise<AuthUser>;
};
const liveAuth: AuthClient = { login: apiLogin, logout: apiLogout, me: apiMe };

/**
 * ส่ง mutation ไป backend ให้ตรงกับ action — เฉพาะ action ที่แก้ entity ที่ server รู้จัก (id ตรงกับ demo seed)
 * create (submitRateRequest/fileDispute) + menu CRUD + cart/order ยัง local-only (ไม่มี endpoint / ต้อง adopt id)
 * คืน undefined = ไม่ต้อง mirror (ทำแค่ local)
 */
function mirror(m: MutationSource, action: Action, prev: State): Promise<unknown> | undefined {
  switch (action.type) {
    case 'adminCancelOrder': return m.cancelOrder(action.id);
    case 'resolveDispute': return m.resolveDispute(action.id, action.amount);
    case 'toggleSuspend': return isSuspended(prev.suspended, action.actor) ? m.unsuspendActor(action.actor) : m.suspendActor(action.actor);
    case 'walletRunSettlement': return m.runSettlement();
    case 'approveRateRequest': return m.approveRateRequest(action.id);
    case 'rejectRateRequest': return m.rejectRateRequest(action.id);
    case 'counterRateRequest': return m.counterRateRequest(action.id, action.counter);
    case 'acceptCounterOffer': return m.acceptCounterOffer(action.id);
    case 'declineCounterOffer': return m.declineCounterOffer(action.id);
    case 'menuAddDish': return m.addMenuItem(action.restaurantId, action.dish);
    case 'menuUpdateDish': return m.updateMenuItem(action.restaurantId, action.dishId, action.fields);
    case 'menuRemoveDish': return m.removeMenuItem(action.restaurantId, action.dishId);
    default: return undefined;
  }
}

// initialState: override seed (เทสต์จำลองสถานการณ์); persist: จำ state ข้ามรีโหลดผ่าน localStorage
// hydrate: ดึงข้อมูลจาก backend ตอน mount (true=ใช้ API จริง, object=แหล่งที่ inject); ล้มเหลว→คงค่า seed (ออฟไลน์ได้)
// sync: mirror mutation ไป backend หลัง dispatch (optimistic local + ยิง API; ล้มเหลว→ rehydrate ทับ rollback)
// authClient: แหล่ง login/logout/me (inject ในเทสต์); ถ้าตั้ง หรือ hydrate → เช็ค me() ตอน mount
export function StoreProvider({ children, initialState, persist, hydrate, sync, authClient }: {
  children: ReactNode;
  initialState?: State;
  persist?: boolean;
  hydrate?: boolean | HydrateSource;
  sync?: boolean | MutationSource;
  authClient?: AuthClient;
}) {
  const [state, dispatch] = useReducer(
    reducer,
    null,
    () => initialState ?? (persist ? loadPersisted() : __seed),
  );

  // บันทึกทุกครั้งที่ state เปลี่ยน (เฉพาะโหมด persist และไม่ได้ override ด้วย initialState)
  useEffect(() => {
    if (!persist || initialState) return;
    try { localStorage.setItem(LS_STATE, JSON.stringify({ v: STATE_VERSION, s: state })); } catch { /* เต็ม/ปิดอยู่ */ }
  }, [state, persist, initialState]);

  // cutover: ดึง state จาก backend — ใช้ทั้งตอน mount และ refetch หลัง mutation ล้มเหลว (rollback)
  // ดึงเฉพาะ read ที่ source มี → ประกอบ patch ก้อนเดียว → dispatch ทับ optimistic ให้ตรง server
  const rehydrate = useCallback(async () => {
    if (!hydrate) return;
    const src = hydrate === true ? liveSource : hydrate;
    const patch: Partial<State> = {};
    const tasks: Promise<void>[] = [];
    if (src.getRestaurants) tasks.push(src.getRestaurants().then((r) => { if (r.length > 0) patch.restaurants = r; }));
    if (src.getOrders) tasks.push(src.getOrders().then((o) => { patch.orders = toAdminOrders(o); }));
    if (src.getDisputes) tasks.push(src.getDisputes().then((d) => { patch.disputes = d; }));
    if (src.getRateRequests) tasks.push(src.getRateRequests().then((q) => { patch.rateRequests = q; }));
    if (src.getModeration) tasks.push(src.getModeration().then((mo) => { Object.assign(patch, toModeration(mo)); }));
    if (src.getLedger) tasks.push(src.getLedger().then((l) => { patch.ledger = l; }));
    if (src.getRateOverrides) tasks.push(src.getRateOverrides().then((ro) => { patch.rateOverrides = ro; }));
    try {
      await Promise.all(tasks);
      if (Object.keys(patch).length > 0) dispatch({ type: 'hydrate', patch });
    } catch { /* ออฟไลน์/ API ล่ม → คงค่าปัจจุบัน */ }
  }, [hydrate]);

  useEffect(() => { void rehydrate(); }, [rehydrate]); // hydrate ตอน mount

  // dispatch ที่ส่งออก: local optimistic (reducer) แล้ว mirror ไป backend เมื่อเปิด sync
  // signature เท่า Dispatch<Action> เดิม → หน้า/เทสต์ไม่ต้องแก้; api-off (ไม่มี sync) = dispatch ล้วน
  // mutation ล้มเหลว → rehydrate() ดึง server ทับ optimistic (rollback ให้ตรงความจริง)
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const dispatchWithSync = useCallback<Dispatch<Action>>((action) => {
    const prev = stateRef.current;
    dispatch(action);
    if (!sync) return;
    const m = sync === true ? liveMutations : sync;
    // mirror ล้มเหลว → แจ้งผู้ใช้ (ข้อความจาก server เช่น "ต้องเข้าสู่ระบบก่อน"/"ไม่ใช่งานของคุณ") + rollback ด้วย refetch
    const rollback = (e: unknown) => {
      dispatch({ type: 'setNotice', text: e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ' });
      void rehydrate();
    };
    // create → adopt server id: optimistic ใส่ local id แล้วแทนด้วย entity จาก server (id ตรง DB)
    // ทำนาย local id จาก prev (ตรงกับสูตรใน reducer) เพื่อรู้ว่าจะ reconcile ตัวไหน
    if (action.type === 'submitRateRequest') {
      const localId = `rr${prev.rateRequests.length + 1}`;
      m.submitRateRequest({ merchantId: action.merchantId, currentRate: action.currentRate, proposedRate: action.proposedRate, reason: action.reason })
        .then((request) => dispatch({ type: 'reconcileRateRequest', localId, request }))
        .catch(rollback);
      return;
    }
    // วางออเดอร์สด → สร้างฝั่ง server (ไม่มีไรเดอร์ — รอ pull-based claim) แล้ว adopt id
    if (action.type === 'place') {
      m.createOrder({ restaurantId: prev.restaurantId, lines: prev.cart.lines, customer: prev.auth?.actorId ?? CUSTOMER_ID })
        .then(({ id }) => dispatch({ type: 'reconcileLiveOrder', id }))
        .catch(rollback);
      return;
    }
    // ไรเดอร์คว้างานออเดอร์สด → assign riderId=session ฝั่ง server (pull-based dispatch ADR 0001)
    if (action.type === 'claimLive') {
      if (prev.liveOrderId) m.claimOrder(prev.liveOrderId).catch(rollback);
      return;
    }
    // เดิน state machine ฝั่ง server: txn (ราง ร้าน/ไรเดอร์) → /transition; ไม่มี txn แต่ Completed (เดโม Track) → /complete
    if (action.type === 'setOrder') {
      if (!prev.liveOrderId) return;
      if (action.txn) m.transitionOrder(prev.liveOrderId, action.txn).catch(rollback);
      else if (action.order.kind === 'Completed' && prev.order?.kind !== 'Completed') m.completeOrder(prev.liveOrderId).catch(rollback);
      return;
    }
    // ร้องเรียนออเดอร์สด → ส่งไป server (ตัวตนผู้ร้องจาก session ฝั่ง server) แล้ว adopt id
    if (action.type === 'fileDispute') {
      if (prev.liveOrderId) {
        const localId = `dp${prev.disputes.length + 1}`;
        m.fileDispute({ orderId: prev.liveOrderId, category: action.category, hasPhoto: action.hasPhoto })
          .then(({ dispute }) => dispatch({ type: 'reconcileDispute', localId, dispute }))
          .catch(rollback);
      }
      return;
    }
    mirror(m, action, prev)?.catch(rollback);
  }, [sync, rehydrate]);

  // ── auth (Lucia session) ──
  const auth = authClient ?? liveAuth;
  // เช็คเซสชันที่ยังอยู่ตอน mount (เปิดเมื่อคุยกับ backend: hydrate หรือ authClient ถูก inject)
  // me() ล้มเหลว (401 = ยังไม่ล็อกอิน) เป็นเรื่องปกติ → คง auth=null
  useEffect(() => {
    if (!hydrate && !authClient) return;
    let cancelled = false;
    auth.me().then((u) => { if (!cancelled) dispatch({ type: 'setAuth', user: u }); }).catch(() => { /* ยังไม่ล็อกอิน */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (actorId: string, password: string): Promise<AuthUser> => {
    const user = await auth.login(actorId, password);
    dispatch({ type: 'setAuth', user });
    return user;
  }, [auth]);

  const logout = useCallback(async (): Promise<void> => {
    try { await auth.logout(); } catch { /* ล้าง local แม้ API ล่ม */ }
    dispatch({ type: 'setAuth', user: null });
  }, [auth]);

  return <Ctx.Provider value={{ state, dispatch: dispatchWithSync, login, logout }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore ต้องอยู่ภายใต้ StoreProvider');
  return c;
}
