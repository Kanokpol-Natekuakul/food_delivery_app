/**
 * ตัวจับเวลาของออเดอร์ (Order Timers) — ค่ากำหนด + ตัวคำนวณเวลา
 *
 * map ตรงจาก docs/order-lifecycle.md ("ตัวจับเวลา") — ที่เดิมระบุพารามิเตอร์ไว้
 * แต่ยังไม่มีค่า ตอนนี้กำหนดเป็น policy ของแพลตฟอร์มแล้ว
 *
 * แยกหน้าที่ชัดเจน: transitions.ts รับ "บูลีนที่ตัดสินจากเวลาแล้ว"
 * (withinFreeWindow / attemptsExhausted ฯลฯ) ส่วนการแปลง "เวลาที่ผ่านไป → บูลีน"
 * เป็นหน้าที่ของไฟล์นี้ ผู้เรียกคำนวณ elapsed จาก timestamp จริงแล้วเรียก predicate
 */

// ─── ค่ากำหนด (policy) ────────────────────────────────────────────────────────

/** หน้าต่างยกเลิกฟรี — หลังจ่ายเงิน ลูกค้ายกเลิกฟรีได้ภายในเวลานี้ (กันแพลตฟอร์มกลืนค่าอาหาร) */
export const FREE_CANCELLATION_WINDOW_SEC = 90;

/** Y = Delivery Timeout — ไม่มีไรเดอร์คว้านานครบเวลานี้ → ระบบยกเลิกอัตโนมัติ (คืนเต็ม) */
export const DELIVERY_TIMEOUT_MIN = 15;

/** Z = Claim Expiry — ไรเดอร์คว้าแล้วไม่คืบหน้าครบเวลานี้ → ปลดงานคืนลิสต์ */
export const CLAIM_EXPIRY_MIN = 8;

/** ส่งไม่ได้ (Failed Delivery): ต้องรอที่หน้าบ้านครบเวลานี้... */
export const FAILED_DELIVERY_WAIT_MIN = 10;
/** ...และโทรหาลูกค้าครบจำนวนนี้ จึงประกาศส่งไม่ได้ */
export const FAILED_DELIVERY_MIN_CALLS = 3;

/**
 * ช่วงให้สิทธิ์ไรเดอร์อันดับสูงก่อน (pull-based dispatch, ADR 0001 + 0006)
 * ไรเดอร์ที่ถูกลดอันดับต้องรอครบช่วงนี้ก่อนจึงคว้างานใหม่ได้ (อันดับสูงได้เลือกก่อน)
 */
export const RIDER_PRIORITY_WINDOW_SEC = 30;

// ─── ตัวคำนวณเวลา → บูลีนที่ transitions ใช้ ─────────────────────────────────

/**
 * ยังอยู่ในหน้าต่างยกเลิกฟรีไหม (ขอบเขตนับว่าอยู่ในหน้าต่าง: elapsed ≤ window)
 * → ป้อนเข้า cancelByCustomer ผ่าน ctx.withinFreeWindow
 */
export function isWithinFreeWindow(
  elapsedSec: number,
  windowSec: number = FREE_CANCELLATION_WINDOW_SEC,
): boolean {
  return elapsedSec <= windowSec;
}

/**
 * ไม่มีไรเดอร์คว้านานจนหมดเวลาแล้วไหม (ครบกำหนด = ทริกเกอร์: elapsed ≥ Y)
 * → เงื่อนไขเรียก deliveryTimeout
 */
export function isDeliveryTimedOut(
  unclaimedMin: number,
  limitMin: number = DELIVERY_TIMEOUT_MIN,
): boolean {
  return unclaimedMin >= limitMin;
}

/**
 * ไรเดอร์คว้าแล้วไม่คืบหน้าจนหมดอายุ claim ไหม (ครบกำหนด = ทริกเกอร์: elapsed ≥ Z)
 * → เงื่อนไขเรียก releaseClaim แบบอัตโนมัติ
 */
export function isClaimExpired(
  noProgressMin: number,
  limitMin: number = CLAIM_EXPIRY_MIN,
): boolean {
  return noProgressMin >= limitMin;
}

/**
 * พยายามส่งครบเกณฑ์หรือยัง — ต้องรอครบเวลา **และ** โทรครบจำนวน (เงื่อนไข AND)
 * → ป้อนเข้า declareFailedDelivery ผ่าน ctx.attemptsExhausted
 */
export function isAttemptsExhausted(
  waitedMin: number,
  calls: number,
  minWaitMin: number = FAILED_DELIVERY_WAIT_MIN,
  minCalls: number = FAILED_DELIVERY_MIN_CALLS,
): boolean {
  return waitedMin >= minWaitMin && calls >= minCalls;
}

/**
 * ไรเดอร์ยังติด "ช่วงให้สิทธิ์อันดับสูงก่อน" อยู่ไหม — ถูกลดอันดับ และยังรอไม่ครบช่วง
 * → ป้อนเข้า claimJob ผ่าน ctx.priorityHeld (ถูกลดอันดับเท่านั้นที่ติดเงื่อนไขนี้)
 */
export function isPriorityHeld(
  downranked: boolean,
  elapsedSec: number,
  windowSec: number = RIDER_PRIORITY_WINDOW_SEC,
): boolean {
  return downranked && elapsedSec < windowSec;
}
