/**
 * แตกส่วนแบ่งรายได้ต่อออเดอร์ (ADR 0003 — โมเดลรายได้ผสม 3 ทาง)
 *
 * ยอดที่ลูกค้าจ่าย = ค่าอาหาร + ค่าส่ง + ค่าบริการ แตกเป็น:
 * - ร้านได้รับ      = ค่าอาหาร − ค่าคอมมิชชัน
 * - ไรเดอร์ได้รับ   = ค่าส่ง − ส่วนแบ่งแพลตฟอร์ม
 * - แพลตฟอร์มได้รับ = ค่าคอมมิชชัน + ค่าบริการ + ส่วนแบ่งค่าส่ง
 *
 * อัตราคอมมิชชัน/ส่วนแบ่งค่าส่งเป็นพารามิเตอร์ที่ ADR 0003 บอกว่า "กำหนดทีหลัง" —
 * ตั้งค่าตั้งต้นไว้ที่นี่ (แก้ได้) และเปิดให้ส่งอัตราเองได้เพื่อทดลอง
 *
 * คิดเป็น "บาทเต็ม" (ปัดคอมมิชชัน/ส่วนแบ่งด้วย Math.round) ให้เข้ากับราคาทั้งระบบที่เป็นจำนวนเต็ม
 */

import type { Amounts } from '../settlement/settlement.js';

export const COMMISSION_RATE = 0.3;      // คอมมิชชันหักจากค่าอาหาร
export const DELIVERY_SHARE_RATE = 0.2;  // ส่วนแบ่งแพลตฟอร์มหักจากค่าส่ง

export type Rates = {
  readonly commissionRate: number;    // 0..1 ของค่าอาหาร
  readonly deliveryShareRate: number; // 0..1 ของค่าส่ง
};

export const DEFAULT_RATES: Rates = {
  commissionRate: COMMISSION_RATE,
  deliveryShareRate: DELIVERY_SHARE_RATE,
};

// ── นโยบายอัตราต่อร้าน/โซน (ADR 0003: อัตราเป็นพารามิเตอร์ที่กำหนดทีหลัง) ──
export type RateOverride = Partial<Rates>;

export type RatePolicy = {
  readonly base: Rates;                                          // อัตราตั้งต้นทั้งระบบ
  readonly byZone?: Readonly<Record<string, RateOverride>>;      // override ตามโซนจัดส่ง
  readonly byMerchant?: Readonly<Record<string, RateOverride>>;  // override ต่อร้าน (ชนะโซน)
};

/**
 * หาอัตราที่ใช้จริงของออเดอร์หนึ่ง — รวมทับกันตามลำดับความเฉพาะเจาะจง:
 * ร้าน (เจาะจงสุด) > โซน > base. คีย์ที่ไม่ถูก override คงค่าจากชั้นล่าง
 */
export function resolveRates(policy: RatePolicy, merchantId?: string, zone?: string): Rates {
  const z = (zone && policy.byZone?.[zone]) || {};
  const m = (merchantId && policy.byMerchant?.[merchantId]) || {};
  return { ...policy.base, ...z, ...m };
}

export type RevenueSplit = {
  readonly commission: number;     // คอมมิชชันที่หักจากร้าน
  readonly merchantNet: number;    // ร้านได้จริง = food − commission
  readonly deliveryShare: number;  // ส่วนแบ่งค่าส่งของแพลตฟอร์ม
  readonly riderNet: number;       // ไรเดอร์ได้จริง = delivery − deliveryShare
  readonly serviceFee: number;     // ค่าบริการ (เข้าแพลตฟอร์มเต็ม)
  readonly platformGross: number;  // commission + serviceFee + deliveryShare
};

/** แตกก้อนรายได้เมื่อออเดอร์เกิดรายได้จริง (สำเร็จ/ส่งไม่ได้-ลูกค้าผิด) */
export function splitRevenue(a: Amounts, rates: Rates = DEFAULT_RATES): RevenueSplit {
  const commission = Math.round(a.food * rates.commissionRate);
  const deliveryShare = Math.round(a.delivery * rates.deliveryShareRate);
  const merchantNet = a.food - commission;
  const riderNet = a.delivery - deliveryShare;
  return {
    commission,
    merchantNet,
    deliveryShare,
    riderNet,
    serviceFee: a.service,
    platformGross: commission + a.service + deliveryShare,
  };
}

// ── เจรจาอัตราคอมมิชชันสองทาง: ร้านยื่นขอ → แอดมินอนุมัติ/ปฏิเสธ/เสนอแย้ง → ร้านตอบรับ/ปฏิเสธ (ADR 0003) ──
export type RateRequestStatus = 'pending' | 'countered' | 'approved' | 'rejected';

export type RateRequest = {
  readonly id: string;
  readonly merchantId: string;
  readonly currentRate: number;   // อัตราคอมปัจจุบัน (0..1)
  readonly proposedRate: number;  // อัตราที่ร้านเสนอ (0..1)
  readonly reason: string;
  readonly status: RateRequestStatus;
  readonly counterRate?: number;  // อัตราที่แอดมินเสนอแย้ง (0..1) — มีเมื่อ status='countered'/ตอบรับแล้ว
};

export type RateRequestInput = Omit<RateRequest, 'status' | 'counterRate'>;
export type RateRequestResult =
  | { readonly ok: true; readonly request: RateRequest }
  | { readonly ok: false; readonly reason: string };

/** ร้านยื่นขอปรับคอม — ต้องเป็นสัดส่วน 0–100% และต่ำกว่าอัตราปัจจุบัน (ขอลด) */
export function requestRate(input: RateRequestInput): RateRequestResult {
  const p = input.proposedRate;
  if (!(p > 0 && p < 1)) return { ok: false, reason: 'อัตราต้องอยู่ระหว่าง 0–100%' };
  if (p >= input.currentRate) return { ok: false, reason: 'ต้องเสนอต่ำกว่าอัตราปัจจุบัน' };
  return { ok: true, request: { ...input, status: 'pending' } };
}

/** แอดมินอนุมัติ — ทำได้จากสถานะ pending เท่านั้น */
export function approveRate(req: RateRequest): RateRequestResult {
  if (req.status !== 'pending') return { ok: false, reason: 'คำขอนี้ปิดไปแล้ว' };
  return { ok: true, request: { ...req, status: 'approved' } };
}

/** แอดมินปฏิเสธ — ทำได้จากสถานะ pending เท่านั้น */
export function rejectRate(req: RateRequest): RateRequestResult {
  if (req.status !== 'pending') return { ok: false, reason: 'คำขอนี้ปิดไปแล้ว' };
  return { ok: true, request: { ...req, status: 'rejected' } };
}

/** แอดมินเสนอแย้ง — ต้องอยู่ "ระหว่าง" ที่ร้านขอกับอัตราปัจจุบัน (ลดให้น้อยกว่าที่ขอ) จาก pending */
export function counterRate(req: RateRequest, counter: number): RateRequestResult {
  if (req.status !== 'pending') return { ok: false, reason: 'คำขอนี้ปิดไปแล้ว' };
  if (!(counter > req.proposedRate && counter < req.currentRate))
    return { ok: false, reason: 'ข้อเสนอแย้งต้องอยู่ระหว่างที่ร้านขอกับอัตราปัจจุบัน' };
  return { ok: true, request: { ...req, status: 'countered', counterRate: counter } };
}

/** ร้านตอบรับข้อเสนอแย้ง → อนุมัติที่อัตราเสนอแย้ง (จาก countered เท่านั้น) */
export function acceptCounter(req: RateRequest): RateRequestResult {
  if (req.status !== 'countered') return { ok: false, reason: 'ไม่มีข้อเสนอแย้งให้ตอบรับ' };
  return { ok: true, request: { ...req, status: 'approved' } };
}

/** ร้านปฏิเสธข้อเสนอแย้ง → ปิดเป็น rejected (จาก countered เท่านั้น) */
export function declineCounter(req: RateRequest): RateRequestResult {
  if (req.status !== 'countered') return { ok: false, reason: 'ไม่มีข้อเสนอแย้งให้ปฏิเสธ' };
  return { ok: true, request: { ...req, status: 'rejected' } };
}

/** อัตราที่ตกลงเมื่ออนุมัติ — ใช้ข้อเสนอแย้งถ้ามี ไม่งั้นใช้ที่ร้านขอ */
export function agreedRate(req: RateRequest): number {
  return req.counterRate ?? req.proposedRate;
}
