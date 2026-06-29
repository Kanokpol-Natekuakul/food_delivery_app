/**
 * สถานะออเดอร์ (Order State Machine)
 *
 * แปลงตรงจาก docs/order-lifecycle.md — ออเดอร์มี 2 รางวิ่งคู่กัน (ราง ร้าน × ราง ไรเดอร์)
 * ที่มาบรรจบกันตอน "ไรเดอร์รับอาหาร" แล้วเดินเป็นเส้นตรงจนจบ
 *
 * หมายเหตุ: การร้องเรียนหลังส่ง (Post-Delivery Disputes / ADR 0006) อยู่ "นอก" state machine นี้
 * เพราะเกิดหลังออเดอร์เป็น Completed แล้ว — ไม่ใช่สถานะของออเดอร์ ดูเป็น flow แยกต่างหาก
 */

// ─── ราง ร้าน (Merchant track) ────────────────────────────────────────────────
// รอร้านรับ → ทำอาหาร → อาหารเสร็จรอไรเดอร์มารับ
export type MerchantStage = 'PendingAccept' | 'Preparing' | 'Ready';

// ─── ราง ไรเดอร์ ก่อนรับอาหาร (pre-handoff) ──────────────────────────────────
// รอไรเดอร์คว้า → คว้าแล้วกำลังไปร้าน → ถึงร้าน
export type PreHandoffRiderStage = 'Unclaimed' | 'Claimed' | 'AtMerchant';

// ─── ราง ไรเดอร์ หลังรับอาหาร (post-handoff) ─────────────────────────────────
// กำลังส่ง → ถึงที่อยู่ลูกค้า (รอ OTP)
export type InTransitRiderStage = 'Delivering' | 'AtCustomer';

/**
 * สถานะรวมของออเดอร์ — discriminated union ตาม `kind`
 *
 * จุดบรรจบถูก encode ลงใน type: `AwaitingHandoff` ถือ 2 รางที่ยังวิ่งคู่กัน
 * ส่วน `InTransit` มีแค่รางไรเดอร์ เพราะรางร้านจบแล้ว (อาหารถูกส่งมอบ = ต้องเป็น Ready ก่อน)
 * จึง "เป็นไปไม่ได้" ที่จะอยู่ InTransit โดยที่ร้านยังไม่เสร็จ — ผิดกฎตั้งแต่ระดับ type
 */
export type OrderState =
  // ── ช่วงก่อนส่งมอบอาหาร: 2 รางวิ่งคู่กัน ──
  | { readonly kind: 'AwaitingHandoff'; readonly merchant: MerchantStage; readonly rider: PreHandoffRiderStage }
  // ── ช่วงกำลังส่ง: ไรเดอร์รับอาหารแล้ว (ร้านจบที่ Ready แล้ว) ──
  | { readonly kind: 'InTransit'; readonly rider: InTransitRiderStage }
  // ── Terminal: สำเร็จ ──
  | { readonly kind: 'Completed' }
  // ── Terminal: จบก่อนสำเร็จ (ดูตารางความรับผิดใน order-lifecycle.md / ADR 0002) ──
  | { readonly kind: 'RejectedByMerchant' }   // ร้านผิด: คืนเต็ม · ร้านจ่ายชดเชยไรเดอร์ · ลดอันดับร้าน
  | { readonly kind: 'CancelledByCustomer' }  // ไม่มีใครผิด: คืนเต็ม · แพลตฟอร์มกลืนค่าอาหาร (เฉพาะตอน rider=Unclaimed)
  | { readonly kind: 'DeliveryTimeout' }      // ไม่มีใครผิด: คืนเต็ม · แพลตฟอร์มกลืนค่าอาหาร (rider=Unclaimed นานเกิน Y)
  | { readonly kind: 'FailedDelivery' }       // ลูกค้าผิด: ไม่คืนเงิน · ไรเดอร์ได้ค่าส่ง · ร้านได้ค่าอาหาร · อาหารเป็นของไรเดอร์
  | { readonly kind: 'CancelledByAdmin' };    // แอดมินบังคับยกเลิก (กำกับดูแล): คืนเต็ม · แพลตฟอร์มรับผิดชอบค่าอาหาร

export type OrderStateKind = OrderState['kind'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TERMINAL_KINDS = [
  'Completed',
  'RejectedByMerchant',
  'CancelledByCustomer',
  'DeliveryTimeout',
  'FailedDelivery',
  'CancelledByAdmin',
] as const satisfies readonly OrderStateKind[];

export type TerminalKind = (typeof TERMINAL_KINDS)[number];

/** ออเดอร์จบแล้วหรือยัง (อยู่ใน terminal state ไหม) */
export function isTerminal(state: OrderState): state is Extract<OrderState, { kind: TerminalKind }> {
  return (TERMINAL_KINDS as readonly string[]).includes(state.kind);
}

/**
 * ตัวช่วยบังคับ exhaustiveness — เรียกใน default ของ switch บน state.kind
 * ถ้าเพิ่ม kind ใหม่แล้วลืมจัดการ จะ error ตอน compile ทันที
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled OrderState kind: ${JSON.stringify(x)}`);
}
