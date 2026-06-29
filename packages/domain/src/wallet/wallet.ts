/**
 * Wallet/Ledger ภายในแพลตฟอร์ม (ADR 0004)
 *
 * ลูกค้าจ่ายเข้าแพลตฟอร์มก่อน (escrow) — เมื่อออเดอร์จบ รายได้ของร้าน/ไรเดอร์ถูก "เครดิต"
 * เข้า wallet ภายใน (ledger) ไม่ได้โอนจริงทันที แล้วจึง "จ่ายออก" เป็นรอบ (settlement/payout)
 * การคืนเงิน (refund) เป็นเพียงรายการในบัญชี ไม่ต้องโอนเงินจริงกลับ
 *
 * ทำงานบนรายการ ledger แบบ append-only (immutable) — balance = ผลรวมของบัญชีนั้น
 */

import type { Settlement } from '../settlement/settlement.js';

export type EntryKind = 'credit' | 'refund' | 'payout';

export type LedgerEntry = {
  readonly account: string; // 'platform' | 'rider' | 'refunds' | 'merchant:<id>'
  readonly amount: number;  // +เครดิต, −จ่ายออก/ติดลบ
  readonly kind: EntryKind;
  readonly orderId: string;
  readonly memo: string;
};

export type Ledger = readonly LedgerEntry[];

// บัญชีคงที่
export const PLATFORM = 'platform';
export const RIDER_POOL = 'rider';
export const REFUNDS = 'refunds';

/** ยอดคงเหลือของบัญชี = ผลรวมรายการทั้งหมดของบัญชีนั้น */
export function balance(ledger: Ledger, account: string): number {
  return ledger.reduce((sum, e) => (e.account === account ? sum + e.amount : sum), 0);
}

/** เพิ่มรายการ (append-only) */
export function post(ledger: Ledger, entry: LedgerEntry): Ledger {
  return [...ledger, entry];
}

/** รายชื่อบัญชีที่มีในบัญชีแยกประเภท (ไม่ซ้ำ เรียงตามที่พบครั้งแรก) */
export function accounts(ledger: Ledger): string[] {
  const seen: string[] = [];
  for (const e of ledger) if (!seen.includes(e.account)) seen.push(e.account);
  return seen;
}

/**
 * ลงบัญชีจากผลสรุป settlement ของออเดอร์หนึ่ง — เครดิตเข้าตามก้อนที่ไม่เป็นศูนย์
 * (refund บันทึกเป็นรายการ ไม่กระทบ wallet ของร้าน/ไรเดอร์)
 */
export function postSettlement(
  ledger: Ledger,
  orderId: string,
  merchantAccount: string,
  s: Settlement,
): Ledger {
  let l = ledger;
  if (s.merchantPayout !== 0) l = post(l, { account: merchantAccount, amount: s.merchantPayout, kind: 'credit', orderId, memo: 'ค่าอาหาร' });
  if (s.riderPayout !== 0) l = post(l, { account: RIDER_POOL, amount: s.riderPayout, kind: 'credit', orderId, memo: 'ค่าส่ง' });
  if (s.platformNet !== 0) l = post(l, { account: PLATFORM, amount: s.platformNet, kind: 'credit', orderId, memo: 'สุทธิแพลตฟอร์ม' });
  if (s.customerRefund !== 0) l = post(l, { account: REFUNDS, amount: s.customerRefund, kind: 'refund', orderId, memo: 'คืนลูกค้า' });
  return l;
}

/**
 * คืนเงิน goodwill หลังส่ง (ADR 0006) — แพลตฟอร์มแบกเอง
 * เดบิต PLATFORM (สุทธิติดลบ) + บันทึก REFUNDS ว่าคืนให้ลูกค้าเท่าไร
 */
export function postGoodwill(ledger: Ledger, orderId: string, amount: number): Ledger {
  if (amount <= 0) return ledger;
  let l = post(ledger, { account: PLATFORM, amount: -amount, kind: 'refund', orderId, memo: 'goodwill ร้องเรียนหลังส่ง' });
  l = post(l, { account: REFUNDS, amount, kind: 'refund', orderId, memo: 'คืน goodwill' });
  return l;
}

/** จ่ายออกเข้าบัญชีธนาคารจริง (settlement รอบ) — เดบิตยอดคงเหลือทั้งหมดให้เป็น 0 */
export function payout(ledger: Ledger, account: string, orderId: string = 'settlement'): Ledger {
  const bal = balance(ledger, account);
  if (bal <= 0) return ledger; // ไม่มีอะไรให้จ่ายออก
  return post(ledger, { account, amount: -bal, kind: 'payout', orderId, memo: 'โอนออกเข้าบัญชีธนาคาร' });
}

// ── นโยบายรอบ settlement + ยอดถอนขั้นต่ำ (ADR 0004 ยังไม่กำหนด — ตั้งต้นไว้ที่นี่ ปรับได้) ──
export const MIN_PAYOUT = 50; // ยอดสะสมขั้นต่ำต่อบัญชีก่อนถอนได้ (ต่ำกว่านี้สะสมไปรอบหน้า)

/** บัญชีนี้ถึงยอดถอนขั้นต่ำของรอบหรือยัง (REFUNDS เป็นบัญชีติดตาม ไม่นับว่าถอนได้) */
export function isPayable(ledger: Ledger, account: string, min: number = MIN_PAYOUT): boolean {
  return account !== REFUNDS && balance(ledger, account) >= min;
}

/** รายชื่อบัญชีที่ถึงเกณฑ์ถอนในรอบนี้ (เรียงตามที่พบครั้งแรกใน ledger) */
export function payableAccounts(ledger: Ledger, min: number = MIN_PAYOUT): string[] {
  return accounts(ledger).filter((a) => isPayable(ledger, a, min));
}

/** รันรอบ settlement: จ่ายออกทุกบัญชีที่ถึงเกณฑ์ในครั้งเดียว (ที่ยังไม่ถึงคงไว้สะสม) */
export function runSettlement(ledger: Ledger, orderId: string = 'settlement-cycle', min: number = MIN_PAYOUT): Ledger {
  return payableAccounts(ledger, min).reduce((l, a) => payout(l, a, orderId), ledger);
}

// ── รอบ settlement ตามเวลาจริง (ADR 0004: รายวัน/สัปดาห์/กดถอน) ──
export type SettlementCadence = 'daily' | 'weekly';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ความยาวคาบของแต่ละ cadence เป็นมิลลิวินาที (เวลาจริง) */
export const CADENCE_MS: Record<SettlementCadence, number> = { daily: DAY_MS, weekly: 7 * DAY_MS };

/** เวลา (ms) ที่ควรรันรอบถัดไป = รอบล่าสุด + คาบ */
export function nextSettlementAt(lastRunMs: number, cadence: SettlementCadence): number {
  return lastRunMs + CADENCE_MS[cadence];
}

/** ถึงรอบ settlement ถัดไปหรือยัง — เวลาจริงปัจจุบันถึง/เลยกำหนดรอบถัดไป */
export function isSettlementDueAt(nowMs: number, lastRunMs: number, cadence: SettlementCadence): boolean {
  return nowMs >= nextSettlementAt(lastRunMs, cadence);
}
