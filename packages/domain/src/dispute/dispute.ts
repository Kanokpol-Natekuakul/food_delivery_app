/**
 * ร้องเรียนหลังส่ง (ADR 0006) — flow ที่อยู่ "นอกวงจรชีวิตออเดอร์"
 *
 * เคสที่ลูกค้าพบหลังรับของ (ผิดรายการ/เสียหาย/มีสิ่งแปลกปลอม) เกิด *หลัง* ออเดอร์ Completed
 * จึงไม่ใช่ terminal state ของ state machine แต่เป็นเอนทิตีแยก (Dispute)
 *
 * หลักการ (ADR 0006):
 * - รายครั้ง: มักพิสูจน์ความผิดไม่ได้ → ถือว่า "ไม่มีใครผิดชัด" → แพลตฟอร์มคืน goodwill จากกระเป๋าตัวเอง
 * - ระยะยาว: เก็บสถิติร้องเรียนรายฝ่าย (ร้าน/ไรเดอร์/ลูกค้า) เพื่อกู้การระบุความผิดด้วยลายเซ็นทางสถิติ
 *
 * โมดูลนี้เป็นลอจิกบริสุทธิ์: คืน Result (ok/reason) ไม่ throw — สอดคล้องกับ transitions ของออเดอร์
 */

import type { OrderState } from '../order/state.js';

/** ความยาว Complaint Window — ADR 0006 ยังไม่กำหนดตัวเลข จึงตั้งต้น 2 ชม. (แก้ภายหลังได้) */
export const COMPLAINT_WINDOW_MIN = 120;

export type DisputeCategory = 'wrong_item' | 'damaged' | 'foreign_object';
export type DisputeStatus = 'open' | 'refunded' | 'rejected';

export type Dispute = {
  readonly id: string;
  readonly orderId: string;
  readonly customer: string; // 'customer:<id>'
  readonly merchant: string; // 'merchant:<id>' — ฝ่ายที่ถูกพาดพิง
  readonly rider: string;    // 'rider:<id>'   — ฝ่ายที่ถูกพาดพิง
  readonly category: DisputeCategory;
  readonly hasPhoto: boolean; // ต้องแนบรูปเป็นหลักฐาน
  readonly status: DisputeStatus;
  readonly refund: number;    // ยอด goodwill ที่คืน (0 จนกว่าจะปิดเคสด้วยการคืนเงิน)
};

export type FileInput = {
  readonly id: string;
  readonly orderId: string;
  readonly customer: string;
  readonly merchant: string;
  readonly rider: string;
  readonly category: DisputeCategory;
  readonly hasPhoto: boolean;
};

export type FileContext = {
  readonly orderKind: OrderState['kind'];
  readonly minutesSinceCompleted: number;
};

export type FileResult =
  | { readonly ok: true; readonly dispute: Dispute }
  | { readonly ok: false; readonly reason: string };

export type ResolveResult =
  | { readonly ok: true; readonly dispute: Dispute }
  | { readonly ok: false; readonly reason: string };

/** ยื่นร้องเรียน — ทำได้เฉพาะออเดอร์ที่ส่งสำเร็จแล้ว ภายในหน้าต่าง และต้องแนบรูป */
export function fileComplaint(input: FileInput, ctx: FileContext): FileResult {
  if (ctx.orderKind !== 'Completed')
    return { ok: false, reason: 'ร้องเรียนได้เฉพาะออเดอร์ที่ส่งสำเร็จแล้ว' };
  if (ctx.minutesSinceCompleted > COMPLAINT_WINDOW_MIN)
    return { ok: false, reason: 'เลยหน้าต่างร้องเรียนแล้ว' };
  if (!input.hasPhoto)
    return { ok: false, reason: 'ต้องแนบรูปเป็นหลักฐาน' };
  return { ok: true, dispute: { ...input, status: 'open', refund: 0 } };
}

/** คืนเงิน goodwill (แพลตฟอร์มแบกเอง) ปิดเคส — ทำได้จากสถานะ open เท่านั้น */
export function resolveGoodwill(d: Dispute, amount: number): ResolveResult {
  if (d.status !== 'open') return { ok: false, reason: 'เคสนี้ปิดไปแล้ว' };
  if (amount <= 0) return { ok: false, reason: 'ยอดคืนต้องมากกว่า 0' };
  return { ok: true, dispute: { ...d, status: 'refunded', refund: amount } };
}

/** ปฏิเสธคำร้อง (เช่น สงสัยอ้างมั่วเพื่อขอ goodwill) ปิดเคสโดยไม่คืนเงิน */
export function reject(d: Dispute): ResolveResult {
  if (d.status !== 'open') return { ok: false, reason: 'เคสนี้ปิดไปแล้ว' };
  return { ok: true, dispute: { ...d, status: 'rejected', refund: 0 } };
}

/**
 * จำนวนเคสที่ฝ่ายนี้ (ร้านหรือไรเดอร์) ถูกร้อง — ไม่นับเคสที่ถูกปฏิเสธ
 * ใช้เป็นลายเซ็นทางสถิติสำหรับลดอันดับ/ดำเนินการ (ADR 0006)
 */
export function complaintsAgainst(disputes: readonly Dispute[], account: string): number {
  return disputes.reduce(
    (n, d) => (d.status !== 'rejected' && (d.merchant === account || d.rider === account) ? n + 1 : n),
    0,
  );
}

/** จำนวนเคสที่ลูกค้ารายนี้ยื่นทั้งหมด (รวมที่ถูกปฏิเสธ) — สัญญาณกันโกง (ADR 0006) */
export function complaintsBy(disputes: readonly Dispute[], customer: string): number {
  return disputes.reduce((n, d) => (d.customer === customer ? n + 1 : n), 0);
}

/**
 * เกณฑ์ "ผิดปกติทางสถิติ" (ADR 0006 ไม่กำหนดตัวเลข — ตั้งต้นไว้ที่นี่ ปรับได้)
 * ใช้ "อัตรา" ร้องเรียน (เคส/ออเดอร์) ไม่ใช่จำนวนดิบ เพื่อความเป็นธรรมกับฝ่ายที่ปริมาณสูง
 */
export const MIN_ORDERS_FOR_RATE = 5; // ตัวอย่างขั้นต่ำก่อนตัดสินด้วยอัตรา (กันฝ่ายใหม่โดนตัดสินจากเคสเดียว)
export const PARTY_RATE_LIMIT = 0.2;    // ร้าน/ไรเดอร์: อัตราร้องเรียนเกิน 20% = ดำเนินการ
export const CUSTOMER_RATE_LIMIT = 0.3; // ลูกค้า: อัตรายื่นร้องเกิน 30% = น่าสงสัย (กันโกง)

/** ระดับการจัดการรายฝ่าย: ปกติ / จับตา / ดำเนินการ */
export type FlagLevel = 'ok' | 'watch' | 'action';

/** อัตราร้องเรียน = #เคส / #ออเดอร์ (คืน 0 ถ้าไม่มีออเดอร์ — กันหารศูนย์) */
export function complaintRate(complaints: number, totalOrders: number): number {
  return totalOrders <= 0 ? 0 : complaints / totalOrders;
}

/**
 * ตัดสินระดับจากจำนวนเคส + ปริมาณออเดอร์ + เกณฑ์อัตรา:
 * - ไม่มีเคส → ok
 * - ตัวอย่างยังน้อย (ตัดสินอัตราไม่ได้) แต่มีเคส → watch (จับตา)
 * - อัตราเกินเกณฑ์ → action; ไม่เกิน → watch
 */
export function flag(complaints: number, totalOrders: number, rateLimit: number): FlagLevel {
  if (complaints === 0) return 'ok';
  if (totalOrders < MIN_ORDERS_FOR_RATE) return 'watch';
  return complaintRate(complaints, totalOrders) > rateLimit ? 'action' : 'watch';
}

/** ระดับของฝ่ายร้าน/ไรเดอร์ (ใช้เคสที่ไม่ถูกปฏิเสธ + เกณฑ์ฝ่าย) */
export function flagParty(disputes: readonly Dispute[], account: string, totalOrders: number): FlagLevel {
  return flag(complaintsAgainst(disputes, account), totalOrders, PARTY_RATE_LIMIT);
}

/** ระดับของลูกค้า (ใช้จำนวนที่ยื่นทั้งหมด + เกณฑ์ลูกค้า) */
export function flagCustomer(disputes: readonly Dispute[], customer: string, totalOrders: number): FlagLevel {
  return flag(complaintsBy(disputes, customer), totalOrders, CUSTOMER_RATE_LIMIT);
}

/** ฝ่ายที่แอดมินกำกับ + ปริมาณออเดอร์ (ตัวหารของอัตรา) */
export type PartyVolume = { readonly account: string; readonly orders: number };

// ── auto-action แบบขั้นบันได (ADR 0006): จับตา→แจ้งเตือน, ดำเนินการ→ลดอันดับ+ระงับ ──
export type ModerationAction = 'notify' | 'downrank' | 'suspend';

/** การลงโทษอัตโนมัติตามระดับ (สะสม: ระดับสูงรวมการลงโทษของระดับล่างด้วย) */
export function autoActions(level: FlagLevel): ModerationAction[] {
  switch (level) {
    case 'ok': return [];
    case 'watch': return ['notify'];
    case 'action': return ['notify', 'downrank', 'suspend'];
  }
}

export type AppliedActions = {
  readonly notified: readonly string[];
  readonly downranked: readonly string[];
  readonly suspended: readonly string[];
};

export type AutoActionPlan = {
  readonly notify: string[];
  readonly downrank: string[];
  readonly suspend: string[];
};

/**
 * วางแผน auto-action ที่ "ยังไม่ได้ทำ" ต่อแต่ละฝ่ายตามระดับสถิติ (ADR 0006)
 * นโยบาย one-directional: ยกระดับการลงโทษเอง แต่ไม่ถอนคืนเอง (ให้แอดมินรีวิว) — จึงข้ามสิ่งที่ทำไปแล้ว
 */
export function planAutoActions(
  disputes: readonly Dispute[],
  parties: readonly PartyVolume[],
  applied: AppliedActions,
): AutoActionPlan {
  const plan: AutoActionPlan = { notify: [], downrank: [], suspend: [] };
  for (const p of parties) {
    const actions = autoActions(flagParty(disputes, p.account, p.orders));
    if (actions.includes('notify') && !applied.notified.includes(p.account)) plan.notify.push(p.account);
    if (actions.includes('downrank') && !applied.downranked.includes(p.account)) plan.downrank.push(p.account);
    if (actions.includes('suspend') && !applied.suspended.includes(p.account)) plan.suspend.push(p.account);
  }
  return plan;
}
