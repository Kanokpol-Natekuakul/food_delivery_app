/**
 * การเปลี่ยนสถานะออเดอร์ (Order Transitions)
 *
 * ทุกฟังก์ชันรับ OrderState ปัจจุบัน แล้วคืน TransitionResult:
 *   - สำเร็จ → { ok: true, state: <สถานะใหม่> }
 *   - transition ผิดกฎ → { ok: false, reason }  (ไม่ throw — ให้ผู้เรียกตัดสินใจ)
 *
 * กฎทั้งหมด map ตรงจาก docs/order-lifecycle.md
 */

import type { OrderState } from './state.js';
import { isTerminal } from './state.js';

export type TransitionResult =
  | { readonly ok: true; readonly state: OrderState }
  | { readonly ok: false; readonly reason: string };

const ok = (state: OrderState): TransitionResult => ({ ok: true, state });
const err = (reason: string): TransitionResult => ({ ok: false, reason });

// ─── จุดเริ่ม ─────────────────────────────────────────────────────────────────

/** ลูกค้าจ่ายเงินสำเร็จ → ออเดอร์เกิด เริ่มที่ 2 รางวิ่งคู่กัน (ร้านรอรับ / งานรอไรเดอร์คว้า) */
export function placeOrder(): OrderState {
  return { kind: 'AwaitingHandoff', merchant: 'PendingAccept', rider: 'Unclaimed' };
}

/**
 * แอดมินบังคับยกเลิกออเดอร์ (เหตุกำกับดูแล/ระบบ) → Terminal: CancelledByAdmin
 * ได้เฉพาะออเดอร์ที่ยังไม่จบ — ความรับผิด: ไม่มีใครผิด ลูกค้าคืนเต็ม แพลตฟอร์มรับผิดชอบ (ดู settlement)
 */
export function adminCancel(state: OrderState): TransitionResult {
  if (isTerminal(state)) return err(`ออเดอร์จบแล้ว ยกเลิกซ้ำไม่ได้ (${state.kind})`);
  return ok({ kind: 'CancelledByAdmin' });
}

// ─── ราง ร้าน (Merchant track) ────────────────────────────────────────────────

/** ร้านกดรับออเดอร์และเริ่มทำอาหาร (PendingAccept → Preparing) */
export function merchantAccept(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`merchantAccept ไม่ได้ในสถานะ ${state.kind}`);
  if (state.merchant !== 'PendingAccept') return err(`ร้านรับไปแล้ว (merchant=${state.merchant})`);
  return ok({ ...state, merchant: 'Preparing' });
}

/** อาหารทำเสร็จ วางรอไรเดอร์มารับ (Preparing → Ready) */
export function merchantMarkReady(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`markReady ไม่ได้ในสถานะ ${state.kind}`);
  if (state.merchant !== 'Preparing') return err(`ต้องกำลังทำอาหารก่อน (merchant=${state.merchant})`);
  return ok({ ...state, merchant: 'Ready' });
}

/**
 * ร้านปฏิเสธออเดอร์ (เช่น ของหมด) → Terminal: RejectedByMerchant
 * ปฏิเสธได้เฉพาะก่อนอาหารเสร็จ (merchant ∈ PendingAccept | Preparing) — อาหารเสร็จแล้วไม่ปฏิเสธ
 * ความรับผิด: ร้านผิด → ลูกค้าคืนเต็ม · ร้านจ่ายชดเชยไรเดอร์ที่คว้าแล้ว · ลดอันดับร้าน (ADR 0002)
 */
export function merchantReject(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`ปฏิเสธไม่ได้ในสถานะ ${state.kind}`);
  if (state.merchant === 'Ready') return err('อาหารเสร็จแล้ว ปฏิเสธไม่ได้');
  return ok({ kind: 'RejectedByMerchant' });
}

// ─── ราง ไรเดอร์ ก่อนรับอาหาร (pre-handoff) ──────────────────────────────────

/**
 * ไรเดอร์คว้างาน (Unclaimed → Claimed) — ล็อกงาน ใครกดก่อนได้ก่อน (race จัดการที่ชั้น persistence)
 * ctx.riderSuspended = true → ไรเดอร์ถูกพักงาน (ADR 0002) คว้างานไม่ได้
 */
export function claimJob(
  state: OrderState,
  ctx: { readonly riderSuspended?: boolean; readonly priorityHeld?: boolean } = {},
): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`คว้างานไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'Unclaimed') return err('งานถูกรับไปแล้ว');
  if (ctx.riderSuspended) return err('ไรเดอร์ถูกพักงาน คว้างานไม่ได้');
  if (ctx.priorityHeld) return err('อยู่ในช่วงให้สิทธิ์ไรเดอร์อันดับสูงก่อน (บัญชีถูกลดอันดับ)');
  return ok({ ...state, rider: 'Claimed' });
}

/**
 * ปลดงานคืนลิสต์ (Claim Expiry) — ไรเดอร์กดยกเลิกงานเอง หรือระบบปลดเพราะไม่คืบหน้า
 * รีเซ็ตรางไรเดอร์กลับเป็น Unclaimed (รางร้านไม่ถูกแตะ) — การพักงานไรเดอร์ที่ทำบ่อยจัดการแยก
 */
export function releaseClaim(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`ปลดงานไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider === 'Unclaimed') return err('งานยังไม่ถูกคว้า');
  return ok({ ...state, rider: 'Unclaimed' });
}

/** ไรเดอร์ถึงร้าน (Claimed → AtMerchant) */
export function riderArriveAtMerchant(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`ไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'Claimed') return err(`ต้องคว้างานก่อน (rider=${state.rider})`);
  return ok({ ...state, rider: 'AtMerchant' });
}

// ─── การยกเลิก/หมดเวลา ก่อนมีไรเดอร์ ─────────────────────────────────────────

/**
 * ลูกค้ายกเลิกเอง → Terminal: CancelledByCustomer
 * เงื่อนไข: ยังไม่มีไรเดอร์คว้า (rider=Unclaimed) **และ** อยู่ในหน้าต่างยกเลิกฟรี
 * (หน้าต่างฟรีเป็นเงื่อนไขเรื่องเวลา ผู้เรียกคำนวณจาก timestamp แล้วส่งเข้ามา)
 * พ้นหน้าต่างฟรีแต่ยังไม่มีไรเดอร์ → ยกเลิกเองไม่ได้ ต้องรอไรเดอร์หรือ Delivery Timeout (ADR 0002 / Q9)
 */
export function cancelByCustomer(
  state: OrderState,
  ctx: { readonly withinFreeWindow: boolean },
): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`ยกเลิกไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'Unclaimed') return err('มีไรเดอร์รับงานแล้ว ยกเลิกไม่ได้');
  if (!ctx.withinFreeWindow) return err('พ้นหน้าต่างยกเลิกฟรีแล้ว ต้องรอไรเดอร์หรือ timeout');
  return ok({ kind: 'CancelledByCustomer' });
}

/**
 * ระบบยกเลิกอัตโนมัติเพราะไม่มีไรเดอร์เกิน Y นาที → Terminal: DeliveryTimeout
 * เงื่อนไข: ยังไม่มีไรเดอร์คว้า (rider=Unclaimed) — ผู้เรียกตรวจว่าเลย Y แล้ว
 * ความรับผิด: ไม่มีใครผิด → ลูกค้าคืนเต็ม · แพลตฟอร์มกลืนค่าอาหาร (ADR 0002)
 */
export function deliveryTimeout(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`timeout ไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'Unclaimed') return err('มีไรเดอร์รับงานแล้ว ไม่เข้าเงื่อนไข timeout');
  return ok({ kind: 'DeliveryTimeout' });
}

// ─── จุดบรรจบ: ไรเดอร์รับอาหาร ────────────────────────────────────────────────

/**
 * ไรเดอร์รับอาหารจากร้าน → ข้ามจาก AwaitingHandoff เข้า InTransit
 * **กฎจุดบรรจบ**: รับได้ก็ต่อเมื่ออาหารเสร็จ (merchant=Ready) และไรเดอร์ถึงร้าน (rider=AtMerchant)
 */
export function pickup(state: OrderState): TransitionResult {
  if (state.kind !== 'AwaitingHandoff') return err(`รับอาหารไม่ได้ในสถานะ ${state.kind}`);
  if (state.merchant !== 'Ready') return err(`อาหารยังไม่เสร็จ (merchant=${state.merchant})`);
  if (state.rider !== 'AtMerchant') return err(`ไรเดอร์ยังไม่ถึงร้าน (rider=${state.rider})`);
  return ok({ kind: 'InTransit', rider: 'Delivering' });
}

// ─── ราง ไรเดอร์ หลังรับอาหาร (in-transit) ───────────────────────────────────

/** ไรเดอร์ถึงที่อยู่ลูกค้า (Delivering → AtCustomer) */
export function riderArriveAtCustomer(state: OrderState): TransitionResult {
  if (state.kind !== 'InTransit') return err(`ไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'Delivering') return err(`สถานะรางไรเดอร์ไม่ถูกต้อง (rider=${state.rider})`);
  return ok({ kind: 'InTransit', rider: 'AtCustomer' });
}

/**
 * ลูกค้าให้ OTP ยืนยันรับของ → Terminal: Completed
 * เงื่อนไข: ถึงที่อยู่ลูกค้าแล้ว (AtCustomer) และ OTP ถูกต้อง (ผู้เรียกตรวจรหัสแล้วส่งผลเข้ามา)
 */
export function confirmDelivery(
  state: OrderState,
  ctx: { readonly otpMatches: boolean },
): TransitionResult {
  if (state.kind !== 'InTransit') return err(`ปิดออเดอร์ไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'AtCustomer') return err('ไรเดอร์ยังไม่ถึงที่อยู่ลูกค้า');
  if (!ctx.otpMatches) return err('OTP ไม่ถูกต้อง');
  return ok({ kind: 'Completed' });
}

/**
 * ส่งไม่ได้ → Terminal: FailedDelivery
 * เงื่อนไข: ถึงที่อยู่แล้ว (AtCustomer) และพยายามครบเกณฑ์ (รอ 10 นาที + โทร 3 ครั้ง)
 * ความรับผิด: ลูกค้าผิด → ไม่คืนเงิน · ไรเดอร์ได้ค่าส่ง · ร้านได้ค่าอาหาร · อาหารเป็นของไรเดอร์
 */
export function declareFailedDelivery(
  state: OrderState,
  ctx: { readonly attemptsExhausted: boolean },
): TransitionResult {
  if (state.kind !== 'InTransit') return err(`ประกาศส่งไม่ได้ในสถานะ ${state.kind}`);
  if (state.rider !== 'AtCustomer') return err('ไรเดอร์ยังไม่ถึงที่อยู่ลูกค้า');
  if (!ctx.attemptsExhausted) return err('ยังพยายามไม่ครบเกณฑ์ (รอ 10 นาที + โทร 3 ครั้ง)');
  return ok({ kind: 'FailedDelivery' });
}
