/**
 * API client — ฟังก์ชัน fetch ที่ผูกกับ routes ของ apps/api (typed ด้วยชนิดจาก @app/domain)
 *
 * นี่คือ "seam" สำหรับสลับ store จาก in-memory → backend จริง:
 * - reducer ปัจจุบันยังเป็น default (เทสต์ใช้, ทำงาน offline ได้)
 * - cutover: ห่อ store ด้วย data layer (เช่น React Query) ที่เรียกฟังก์ชันเหล่านี้แทน dispatch
 *   แล้ว hydrate state จาก GET ตอนโหลด + ยิง mutation ตอนผู้ใช้ทำ action (ต้องมี apps/api รันจริง)
 */
import type { OrderState } from '@app/domain/order/state.js';
import type { OrderLine } from '@app/domain/cart/cart.js';
import type { Dispute, DisputeCategory, AutoActionPlan } from '@app/domain/dispute/dispute.js';
import type { RateRequest } from '@app/domain/revenue/revenue.js';
import type { Settlement } from '@app/domain/settlement/settlement.js';
import type { LedgerEntry } from '@app/domain/wallet/wallet.js';
import type { Restaurant } from '@app/domain/catalog/catalog.js';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' }; // credentials: ส่ง session cookie (Lucia)
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── catalog (ร้าน + เมนู) — ใช้ hydrate state.restaurants แทน hardcode ──
export const getRestaurants = () => req<Restaurant[]>('GET', '/restaurants');
export const getRestaurant = (id: string) => req<Restaurant>('GET', `/restaurants/${id}`);

// ── ออเดอร์ ──
export type ApiPlaced = { restaurantId: string | null; lines: OrderLine[] };
export type ApiOrder = { id: string; restaurantId: string | null; riderId: string | null; customerId: string | null; placed: ApiPlaced; state: OrderState };
export type CreateOrderInput = { restaurantId: string | null; lines: OrderLine[]; customer?: string; rider?: string };
export const getOrders = () => req<ApiOrder[]>('GET', '/orders');
export const createOrder = (input: CreateOrderInput) => req<{ id: string; state: OrderState }>('POST', '/orders', input);
export const completeOrder = (id: string) => req<{ ok: true; state: OrderState }>('POST', `/orders/${id}/complete`);
export const cancelOrder = (id: string) => req<{ ok: true; state: OrderState; settlement: Settlement | null }>('POST', `/orders/${id}/cancel`);

// ── auth (Lucia) — ตัวตนจาก session cookie ──
export type AuthUser = { actorId: string; role: string };
export const login = (actorId: string, password: string) => req<AuthUser>('POST', '/auth/login', { actorId, password });
export const logout = () => req<{ ok: true }>('POST', '/auth/logout');
export const me = () => req<AuthUser>('GET', '/auth/me');

// ── ร้องเรียนหลังส่ง (ADR 0006) — customer/merchant/rider มาจาก session+ออเดอร์ ฝั่ง server ──
export type FileDisputeInput = { orderId: string; category: DisputeCategory; hasPhoto: boolean };
export const getDisputes = () => req<Dispute[]>('GET', '/disputes');
export const fileDispute = (input: FileDisputeInput) => req<{ dispute: Dispute; autoAction: AutoActionPlan }>('POST', '/disputes', input);
export const resolveDispute = (id: string, amount: number) => req<{ ok: true; dispute: Dispute }>('POST', `/disputes/${id}/resolve`, { amount });

// ── เจรจาอัตราคอม (ADR 0003) ──
export type SubmitRateInput = { merchantId: string; currentRate: number; proposedRate: number; reason?: string };
export const getRateRequests = () => req<RateRequest[]>('GET', '/rate-requests');
export const submitRateRequest = (input: SubmitRateInput) => req<RateRequest>('POST', '/rate-requests', input);
export const approveRateRequest = (id: string) => req<RateRequest>('POST', `/rate-requests/${id}/approve`);
export const rejectRateRequest = (id: string) => req<RateRequest>('POST', `/rate-requests/${id}/reject`);
export const counterRateRequest = (id: string, counter: number) => req<RateRequest>('POST', `/rate-requests/${id}/counter`, { counter });
export const acceptCounterOffer = (id: string) => req<RateRequest>('POST', `/rate-requests/${id}/accept`);
export const declineCounterOffer = (id: string) => req<RateRequest>('POST', `/rate-requests/${id}/decline`);

// ── กำกับดูแล (ADR 0006) ──
export type ApiModeration = { account: string; suspended: boolean; downranked: boolean; notified: boolean };
export const getModeration = () => req<ApiModeration[]>('GET', '/moderation');
export const suspendActor = (account: string) => req<{ ok: true }>('POST', `/moderation/${encodeURIComponent(account)}/suspend`);
export const unsuspendActor = (account: string) => req<{ ok: true }>('POST', `/moderation/${encodeURIComponent(account)}/unsuspend`);
export const runAutoActions = () => req<AutoActionPlan>('POST', '/moderation/run-auto-actions');

// ── wallet / settlement (ADR 0004) ──
export const getWallet = () => req<{ account: string; balance: number }[]>('GET', '/wallet');
export const getLedger = () => req<LedgerEntry[]>('GET', '/ledger');
export const runSettlement = () => req<{ posted: number }>('POST', '/settlement/run');

// ── อัตราคอมที่เจรจาแล้ว (merchantId → rate) ──
export const getRateOverrides = () => req<Record<string, number>>('GET', '/rate-overrides');
