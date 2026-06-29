/**
 * การหักลบแบ่งเงินเมื่อออเดอร์จบ (Settlement) — สรุปยอดต่อหนึ่งออเดอร์ฝั่ง Admin
 *
 * อิง ADR 0002 (โมเดลความรับผิด) + ADR 0003 (รายได้ผสม):
 * - ลูกค้าคืนเต็มเสมอเมื่อออเดอร์ไม่สำเร็จ ("คืนเต็ม" = ค่าอาหาร+ค่าส่ง+ค่าบริการ)
 * - ใครผิดคนนั้นแบก · ไม่มีใครผิด → แพลตฟอร์มแบกค่าอาหาร
 * - สำเร็จ/ส่งไม่ได้ (ลูกค้าผิด): ร้านได้ค่าอาหาร ไรเดอร์ได้ค่าส่ง แพลตฟอร์มได้ค่าบริการ
 *
 * แตกส่วนแบ่งย่อย (คอมมิชชัน/ส่วนแบ่งค่าส่ง) ตาม ADR 0003 ผ่านโดเมน `revenue` เฉพาะเคสที่
 * เกิดรายได้จริง (สำเร็จ/ส่งไม่ได้-ลูกค้าผิด): ร้าน=อาหาร−คอม, ไรเดอร์=ส่ง−แบ่ง, แพลตฟอร์ม=คอม+บริการ+แบ่ง
 * เคสล้มเหลว/คืนเต็ม ไม่มีรายได้เกิด → ไม่แตก (split = null)
 */

import type { OrderState } from '../order/state.js';
import { splitRevenue, DEFAULT_RATES } from '../revenue/revenue.js';
import type { Rates, RevenueSplit } from '../revenue/revenue.js';

export type Fault = 'none' | 'customer' | 'merchant';

export type Amounts = { readonly food: number; readonly delivery: number; readonly service: number };

export type Settlement = {
  readonly fault: Fault;
  readonly customerRefund: number; // คืนให้ลูกค้า
  readonly merchantPayout: number; // ร้านได้รับ (สุทธิหลังหักคอมมิชชัน)
  readonly riderPayout: number;    // ไรเดอร์ได้รับ (สุทธิหลังหักส่วนแบ่งค่าส่ง)
  readonly platformNet: number;    // แพลตฟอร์มสุทธิ (ติดลบ = แบกต้นทุน)
  readonly split: RevenueSplit | null; // รายละเอียดการแตกเงิน (null = ไม่มีรายได้เกิด)
  readonly note: string;
};

/** สรุปยอดของออเดอร์ — คืน null ถ้ายังไม่จบ (ยังสรุปไม่ได้) */
export function settle(state: OrderState, a: Amounts, rates: Rates = DEFAULT_RATES): Settlement | null {
  const total = a.food + a.delivery + a.service;

  switch (state.kind) {
    case 'AwaitingHandoff':
    case 'InTransit':
      return null; // ยังดำเนินอยู่

    case 'Completed': {
      const split = splitRevenue(a, rates);
      return {
        fault: 'none',
        customerRefund: 0,
        merchantPayout: split.merchantNet,
        riderPayout: split.riderNet,
        platformNet: split.platformGross,
        split,
        note: 'สำเร็จ: ร้านได้ค่าอาหาร−คอมมิชชัน ไรเดอร์ได้ค่าส่ง−ส่วนแบ่ง แพลตฟอร์มได้คอม+บริการ+ส่วนแบ่ง',
      };
    }

    case 'FailedDelivery': {
      const split = splitRevenue(a, rates);
      return {
        fault: 'customer',
        customerRefund: 0,
        merchantPayout: split.merchantNet,
        riderPayout: split.riderNet,
        platformNet: split.platformGross,
        split,
        note: 'ลูกค้าผิด: ไม่คืนเงิน · แตกส่วนแบ่งเหมือนสำเร็จ · อาหารเป็นของไรเดอร์',
      };
    }

    case 'RejectedByMerchant':
      return {
        fault: 'merchant',
        customerRefund: total,
        merchantPayout: 0,
        riderPayout: 0,
        platformNet: 0,
        split: null, // ไม่มีรายได้เกิด
        note: 'ร้านผิด: ลูกค้าคืนเต็ม · ร้านจ่ายชดเชยไรเดอร์ที่คว้าแล้ว + โดนลดอันดับ',
      };

    case 'CancelledByCustomer':
      return {
        fault: 'none',
        customerRefund: total,
        merchantPayout: a.food,
        riderPayout: 0,
        platformNet: -a.food,
        split: null, // ไม่มีรายได้เกิด — แพลตฟอร์มกลืนค่าอาหารที่ร้านทำ ไม่หักคอมมิชชัน
        note: 'ยกเลิกในหน้าต่างฟรี: ลูกค้าคืนเต็ม · แพลตฟอร์มกลืนค่าอาหาร',
      };

    case 'DeliveryTimeout':
      return {
        fault: 'none',
        customerRefund: total,
        merchantPayout: a.food,
        riderPayout: 0,
        platformNet: -a.food,
        split: null,
        note: 'ไม่มีไรเดอร์: ลูกค้าคืนเต็ม · แพลตฟอร์มกลืนค่าอาหาร',
      };

    case 'CancelledByAdmin':
      return {
        fault: 'none',
        customerRefund: total,
        merchantPayout: a.food,
        riderPayout: 0,
        platformNet: -a.food,
        split: null,
        note: 'แอดมินยกเลิก: ลูกค้าคืนเต็ม · แพลตฟอร์มรับผิดชอบค่าอาหาร',
      };
  }
}
