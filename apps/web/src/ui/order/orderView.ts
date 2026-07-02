/**
 * orderView — แปลง OrderState (โดเมน) → view-model ของหน้าติดตาม "รางคู่"
 *
 * เป็นฟังก์ชัน pure ที่เป็น "สะพาน" ระหว่าง state machine กับ UI:
 * UI ไม่รู้จัก logic ของออเดอร์เลย แค่ render ตาม view-model ที่ได้จากที่นี่
 */
import type { OrderState } from '@app/domain/order/state.js';
import { assertNever } from '@app/domain/order/state.js';

export type Status = 'done' | 'active' | 'todo' | 'broken' | 'released';
export type Node = { label: string; status: Status };
export type Terminal = { icon: string; title: string; body: string; action: string };

export type TrackerView = {
  headline: string;
  sub: string;
  cancel: boolean; // แสดงชิป "ยกเลิกฟรีได้อีก ..."
  kitchen: [Node, Node, Node];
  rider: [Node, Node, Node];
  single: [Node, Node];
  merge: 'live' | 'done' | 'off';
  mergeTitle: string;
  mergeSub: string;
  otp: 'locked' | 'live' | 'done' | 'hide';
  terminal: Terminal | null;
};

const K = ['ยืนยันรับออเดอร์', 'กำลังทำอาหาร', 'อาหารเสร็จ'] as const;
const R = ['รอไรเดอร์คว้า', 'คว้างานแล้ว', 'ถึงร้าน'] as const;
const S = ['กำลังไปส่ง', 'ถึงหน้าบ้านคุณ'] as const;

const k3 = (s: [Status, Status, Status]): [Node, Node, Node] =>
  [{ label: K[0], status: s[0] }, { label: K[1], status: s[1] }, { label: K[2], status: s[2] }];
const r3 = (s: [Status, Status, Status]): [Node, Node, Node] =>
  [{ label: R[0], status: s[0] }, { label: R[1], status: s[1] }, { label: R[2], status: s[2] }];
const s2 = (s: [Status, Status]): [Node, Node] =>
  [{ label: S[0], status: s[0] }, { label: S[1], status: s[1] }];

/** terminal ที่จบก่อนถึงจุดบรรจบ (รางหลอมรวมปิด) */
function terminalView(
  headline: string,
  sub: string,
  kitchen: [Node, Node, Node],
  rider: [Node, Node, Node],
  terminal: Terminal,
): TrackerView {
  return {
    headline, sub, cancel: false, kitchen, rider, single: s2(['todo', 'todo']),
    merge: 'off', mergeTitle: 'ไรเดอร์รับอาหาร', mergeSub: '', otp: 'hide', terminal,
  };
}

export function orderView(state: OrderState): TrackerView {
  switch (state.kind) {
    case 'AwaitingHandoff': {
      const m = state.merchant;
      const r = state.rider;
      const kitchen = k3(
        m === 'PendingAccept' ? ['active', 'todo', 'todo']
          : m === 'Preparing' ? ['done', 'active', 'todo']
            : ['done', 'done', 'done'],
      );
      const rider = r3(
        r === 'Unclaimed' ? ['active', 'todo', 'todo']
          : r === 'Claimed' ? ['done', 'active', 'todo']
            : ['done', 'done', 'active'],
      );
      const headline = m !== 'Ready' ? 'กำลังทำอาหาร...' : r !== 'AtMerchant' ? 'รอไรเดอร์มารับ' : 'พร้อมส่งมอบ';
      const sub = r === 'Unclaimed' ? 'กำลังหาไรเดอร์ให้คุณ'
        : r === 'AtMerchant' && m !== 'Ready' ? 'ไรเดอร์ถึงร้านแล้ว — รออาหารเสร็จ'
          : 'กำลังดำเนินการ';
      return {
        headline, sub, cancel: r === 'Unclaimed', kitchen, rider, single: s2(['todo', 'todo']),
        merge: 'live', mergeTitle: 'ไรเดอร์รับอาหาร',
        mergeSub: m === 'Ready' && r === 'AtMerchant' ? 'พร้อมรับอาหาร' : 'รออาหารเสร็จ + ไรเดอร์ถึงร้าน',
        otp: 'locked', terminal: null,
      };
    }
    case 'InTransit': {
      const at = state.rider === 'AtCustomer';
      return {
        headline: at ? 'ไรเดอร์ถึงแล้ว!' : 'กำลังไปส่ง',
        sub: at ? 'บอกรหัสกับไรเดอร์เพื่อรับของ' : 'ไรเดอร์รับอาหารแล้ว กำลังมุ่งหน้าหาคุณ',
        cancel: false, kitchen: k3(['done', 'done', 'done']), rider: r3(['done', 'done', 'done']),
        single: s2(at ? ['done', 'active'] : ['active', 'todo']),
        merge: 'done', mergeTitle: 'ไรเดอร์รับอาหารแล้ว', mergeSub: '',
        otp: at ? 'live' : 'locked', terminal: null,
      };
    }
    case 'Completed':
      return {
        headline: 'รับของสำเร็จ', sub: 'ขอบคุณที่สั่ง — ทานให้อร่อยนะ', cancel: false,
        kitchen: k3(['done', 'done', 'done']), rider: r3(['done', 'done', 'done']), single: s2(['done', 'done']),
        merge: 'done', mergeTitle: 'ไรเดอร์รับอาหารแล้ว', mergeSub: '', otp: 'done', terminal: null,
      };
    case 'RejectedByMerchant':
      return terminalView('ร้านของหมดพอดี', 'ออเดอร์ถูกยกเลิก',
        k3(['done', 'broken', 'todo']), r3(['done', 'released', 'todo']),
        { icon: 'flame', title: 'ร้านของหมดพอดี', body: 'คืนเงินเต็มจำนวนเข้าช่องทางเดิมให้แล้ว ลองร้านอร่อยใกล้ๆ คุณดูไหม', action: 'ดูร้านใกล้ฉัน' });
    case 'CancelledByCustomer':
      return terminalView('ยกเลิกออเดอร์แล้ว', 'คืนเงินให้เรียบร้อย',
        k3(['done', 'todo', 'todo']), r3(['todo', 'todo', 'todo']),
        { icon: 'trash', title: 'ยกเลิกออเดอร์แล้ว', body: 'คืนเงินเต็มจำนวนเข้าช่องทางเดิมให้แล้ว', action: 'สั่งใหม่อีกครั้ง' });
    case 'DeliveryTimeout':
      return terminalView('หาไรเดอร์ไม่ได้', 'คืนเงินเต็มจำนวนแล้ว',
        k3(['done', 'done', 'done']), r3(['todo', 'todo', 'todo']),
        { icon: 'hourglass', title: 'หาไรเดอร์ไม่ได้', body: 'ช่วงนี้ไรเดอร์เต็มมือ คืนเงินเต็มจำนวนให้แล้ว ขอโทษด้วยนะ', action: 'ลองสั่งใหม่' });
    case 'FailedDelivery':
      return {
        headline: 'ส่งไม่สำเร็จ', sub: 'ติดต่อคุณไม่ได้ที่จุดหมาย', cancel: false,
        kitchen: k3(['done', 'done', 'done']), rider: r3(['done', 'done', 'done']), single: s2(['done', 'broken']),
        merge: 'done', mergeTitle: 'ไรเดอร์รับอาหารแล้ว', mergeSub: '', otp: 'hide',
        terminal: { icon: 'door', title: 'ส่งไม่สำเร็จ', body: 'ไรเดอร์รอแล้วแต่ติดต่อคุณไม่ได้ — ดูรายละเอียดในความช่วยเหลือ', action: 'ติดต่อช่วยเหลือ' },
      };
    case 'CancelledByAdmin':
      return terminalView('ออเดอร์ถูกยกเลิกโดยระบบ', 'คืนเงินเต็มจำนวนแล้ว',
        k3(['done', 'todo', 'todo']), r3(['todo', 'todo', 'todo']),
        { icon: 'wrench', title: 'ออเดอร์ถูกยกเลิกโดยระบบ', body: 'แอดมินยกเลิกออเดอร์นี้ คืนเงินเต็มจำนวนเข้าช่องทางเดิมให้แล้ว', action: 'สั่งใหม่อีกครั้ง' });
    default:
      return assertNever(state);
  }
}
