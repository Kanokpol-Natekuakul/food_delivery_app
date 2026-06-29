/**
 * มุมมองฝั่งไรเดอร์ (Rider View) — แปลง OrderState เป็น "ไรเดอร์เห็นอะไร/กดอะไรได้"
 *
 * เป็นแหล่งความจริงเดียวของคอนโซลไรเดอร์: UI แค่เรนเดอร์ตาม actions ที่คืนมา
 * กฎตรงกับ transitions.ts — โดยเฉพาะ "จุดบรรจบ": รับอาหาร (pickup) ได้ก็ต่อเมื่อ
 * อาหารเสร็จ (merchant=Ready) และไรเดอร์ถึงร้าน (rider=AtMerchant) พร้อมกัน
 */

import type { OrderState } from './state.js';
import { assertNever } from './state.js';

export type RiderAction =
  | 'claim'              // claimJob
  | 'arriveAtMerchant'   // riderArriveAtMerchant
  | 'pickup'             // pickup (ต้องอาหารเสร็จ)
  | 'arriveAtCustomer'   // riderArriveAtCustomer
  | 'confirmDelivery'    // confirmDelivery (ต้อง OTP)
  | 'declareFailed'      // declareFailedDelivery (ต้องครบเกณฑ์พยายาม)
  | 'release';           // releaseClaim (คืนงานคืนลิสต์)

export type RiderView = {
  /** ป้ายสถานะรางไรเดอร์ */
  readonly stageLabel: string;
  /** ปุ่มที่ไรเดอร์กดได้ตอนนี้ */
  readonly actions: readonly RiderAction[];
  /** มีงานให้ไรเดอร์ทำอยู่ไหม (false = งานจบ/ไม่เกี่ยวกับไรเดอร์แล้ว) */
  readonly active: boolean;
};

export function riderView(state: OrderState): RiderView {
  switch (state.kind) {
    case 'AwaitingHandoff':
      switch (state.rider) {
        case 'Unclaimed':
          return { stageLabel: 'มีงานใหม่ รอไรเดอร์คว้า', actions: ['claim'], active: true };
        case 'Claimed':
          return { stageLabel: 'รับงานแล้ว กำลังไปร้าน', actions: ['arriveAtMerchant', 'release'], active: true };
        case 'AtMerchant':
          // จุดบรรจบ: รับอาหารได้เฉพาะตอนอาหารเสร็จ ไม่งั้นรอที่ร้าน (ยังคืนงานได้)
          return state.merchant === 'Ready'
            ? { stageLabel: 'อาหารพร้อม รับได้เลย', actions: ['pickup'], active: true }
            : { stageLabel: 'ถึงร้านแล้ว รออาหารเสร็จ', actions: ['release'], active: true };
        default:
          return assertNever(state);
      }
    case 'InTransit':
      switch (state.rider) {
        case 'Delivering':
          return { stageLabel: 'กำลังไปส่งลูกค้า', actions: ['arriveAtCustomer'], active: true };
        case 'AtCustomer':
          return { stageLabel: 'ถึงหน้าบ้านลูกค้า', actions: ['confirmDelivery', 'declareFailed'], active: true };
        default:
          return assertNever(state);
      }
    case 'Completed':
      return { stageLabel: 'ส่งสำเร็จ', actions: [], active: false };
    case 'FailedDelivery':
      return { stageLabel: 'ส่งไม่สำเร็จ', actions: [], active: false };
    case 'DeliveryTimeout':
      return { stageLabel: 'งานหมดเวลา (ไม่มีไรเดอร์)', actions: [], active: false };
    case 'CancelledByCustomer':
      return { stageLabel: 'ลูกค้ายกเลิก', actions: [], active: false };
    case 'RejectedByMerchant':
      return { stageLabel: 'ร้านปฏิเสธออเดอร์', actions: [], active: false };
    case 'CancelledByAdmin':
      return { stageLabel: 'แอดมินยกเลิกออเดอร์', actions: [], active: false };
    default:
      return assertNever(state);
  }
}
