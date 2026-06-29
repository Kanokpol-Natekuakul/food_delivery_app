/**
 * มุมมองฝั่งร้าน (Merchant View) — แปลง OrderState เป็น "ร้านเห็นอะไร/กดอะไรได้"
 *
 * เป็นแหล่งความจริงเดียวของคอนโซลรับออเดอร์ฝั่งร้าน: UI แค่เรนเดอร์ตาม actions ที่คืนมา
 * กฎตรงกับ transitions.ts (รับ/ทำเสร็จ/ปฏิเสธ) — ปฏิเสธได้เฉพาะก่อนอาหารเสร็จ
 */

import type { OrderState } from './state.js';
import { assertNever } from './state.js';

/** action ที่ร้านกดได้ — map ตรงกับ merchantAccept / merchantMarkReady / merchantReject */
export type MerchantAction = 'accept' | 'markReady' | 'reject';

export type MerchantView = {
  /** ป้ายสถานะรางร้าน */
  readonly stageLabel: string;
  /** ปุ่มที่ร้านกดได้ตอนนี้ (ว่าง = ไม่มีอะไรให้ทำ) */
  readonly actions: readonly MerchantAction[];
  /** ร้านยังเกี่ยวข้องกับออเดอร์นี้ไหม (false = ส่งมอบของ/ออเดอร์จบแล้ว) */
  readonly active: boolean;
};

export function merchantView(state: OrderState): MerchantView {
  switch (state.kind) {
    case 'AwaitingHandoff':
      switch (state.merchant) {
        case 'PendingAccept':
          return { stageLabel: 'รอร้านรับออเดอร์', actions: ['accept', 'reject'], active: true };
        case 'Preparing':
          return { stageLabel: 'กำลังทำอาหาร', actions: ['markReady', 'reject'], active: true };
        case 'Ready':
          return { stageLabel: 'อาหารเสร็จ รอไรเดอร์มารับ', actions: [], active: true };
        default:
          return assertNever(state.merchant);
      }
    case 'InTransit':
      return { stageLabel: 'ไรเดอร์รับอาหารไปแล้ว', actions: [], active: false };
    case 'Completed':
      return { stageLabel: 'ส่งสำเร็จ', actions: [], active: false };
    case 'RejectedByMerchant':
      return { stageLabel: 'ร้านปฏิเสธออเดอร์', actions: [], active: false };
    case 'CancelledByCustomer':
      return { stageLabel: 'ลูกค้ายกเลิก', actions: [], active: false };
    case 'DeliveryTimeout':
      return { stageLabel: 'หมดเวลาไร้ไรเดอร์', actions: [], active: false };
    case 'FailedDelivery':
      return { stageLabel: 'ส่งไม่สำเร็จ', actions: [], active: false };
    case 'CancelledByAdmin':
      return { stageLabel: 'แอดมินยกเลิกออเดอร์', actions: [], active: false };
    default:
      return assertNever(state);
  }
}
