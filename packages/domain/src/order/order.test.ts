import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OrderState } from './state.js';
import { isTerminal } from './state.js';
import type { TransitionResult } from './transitions.js';
import {
  placeOrder, merchantAccept, merchantMarkReady, merchantReject,
  claimJob, releaseClaim, riderArriveAtMerchant,
  cancelByCustomer, deliveryTimeout,
  pickup, riderArriveAtCustomer, confirmDelivery, declareFailedDelivery,
} from './transitions.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** ยืนยันว่า transition ผ่าน แล้วคืนสถานะใหม่ */
function must(r: TransitionResult): OrderState {
  if (!r.ok) assert.fail(`คาดว่าผ่านแต่ถูกปฏิเสธ: ${r.reason}`);
  return r.state;
}

/** ยืนยันว่า transition ถูกปฏิเสธ แล้วคืนเหตุผล */
function rejected(r: TransitionResult): string {
  assert.equal(r.ok, false, 'คาดว่าถูกปฏิเสธแต่กลับผ่าน');
  if (r.ok) throw new Error('unreachable');
  return r.reason;
}

/** เดินถึงสถานะ AwaitingHandoff ที่ระบุ stage ของแต่ละราง */
function awaiting(merchant: 'accept' | 'ready', rider: 'unclaimed' | 'claimed' | 'atMerchant'): OrderState {
  let s = placeOrder();
  if (rider !== 'unclaimed') s = must(claimJob(s));
  if (rider === 'atMerchant') s = must(riderArriveAtMerchant(s));
  if (merchant === 'ready') {
    s = must(merchantAccept(s));
    s = must(merchantMarkReady(s));
  }
  return s;
}

// ─── happy path ──────────────────────────────────────────────────────────────

test('happy path เดินถึง Completed', () => {
  let s = placeOrder();
  assert.deepEqual(s, { kind: 'AwaitingHandoff', merchant: 'PendingAccept', rider: 'Unclaimed' });

  s = must(merchantAccept(s));
  s = must(claimJob(s));
  s = must(riderArriveAtMerchant(s));
  s = must(merchantMarkReady(s));
  s = must(pickup(s));
  assert.deepEqual(s, { kind: 'InTransit', rider: 'Delivering' });

  s = must(riderArriveAtCustomer(s));
  s = must(confirmDelivery(s, { otpMatches: true }));
  assert.deepEqual(s, { kind: 'Completed' });
  assert.ok(isTerminal(s));
});

test('ลำดับ 2 รางสลับกันได้ (ไรเดอร์มาก่อนอาหารเสร็จ)', () => {
  let s = placeOrder();
  s = must(claimJob(s));                 // ไรเดอร์คว้าก่อน
  s = must(riderArriveAtMerchant(s));    // ถึงร้านก่อนอาหารเสร็จ
  assert.equal(rejected(pickup(s)), 'อาหารยังไม่เสร็จ (merchant=PendingAccept)');
  s = must(merchantAccept(s));
  s = must(merchantMarkReady(s));        // อาหารเสร็จทีหลัง
  s = must(pickup(s));                   // ตอนนี้รับได้
  assert.equal(s.kind, 'InTransit');
});

// ─── จุดบรรจบ (pickup) ─────────────────────────────────────────────────────────

test('pickup ต้องการทั้ง Ready และ AtMerchant', () => {
  assert.match(rejected(pickup(awaiting('accept', 'atMerchant'))), /อาหารยังไม่เสร็จ/);
  assert.match(rejected(pickup(awaiting('ready', 'claimed'))), /ไรเดอร์ยังไม่ถึงร้าน/);
  assert.match(rejected(pickup(awaiting('ready', 'unclaimed'))), /ไรเดอร์ยังไม่ถึงร้าน/);
  assert.equal(must(pickup(awaiting('ready', 'atMerchant'))).kind, 'InTransit');
});

// ─── ราง ร้าน ─────────────────────────────────────────────────────────────────

test('ร้าน: รับ → ทำเสร็จ ต้องตามลำดับ', () => {
  const fresh = placeOrder();
  assert.match(rejected(merchantMarkReady(fresh)), /ต้องกำลังทำอาหารก่อน/);
  const preparing = must(merchantAccept(fresh));
  assert.match(rejected(merchantAccept(preparing)), /ร้านรับไปแล้ว/);
  assert.equal(must(merchantMarkReady(preparing)).kind, 'AwaitingHandoff');
});

test('ปฏิเสธได้ก่อนอาหารเสร็จ แต่ไม่ได้หลัง Ready', () => {
  assert.equal(must(merchantReject(placeOrder())).kind, 'RejectedByMerchant');
  assert.equal(must(merchantReject(awaiting('accept', 'claimed'))).kind, 'RejectedByMerchant'); // กำลังทำ
  assert.match(rejected(merchantReject(awaiting('ready', 'atMerchant'))), /อาหารเสร็จแล้ว/);
});

// ─── ราง ไรเดอร์ ───────────────────────────────────────────────────────────────

test('คว้างานได้ครั้งเดียว ปลดแล้วคว้าใหม่ได้', () => {
  const claimed = must(claimJob(placeOrder()));
  assert.match(rejected(claimJob(claimed)), /งานถูกรับไปแล้ว/);
  const released = must(releaseClaim(claimed));
  assert.equal(released.kind === 'AwaitingHandoff' && released.rider, 'Unclaimed');
  assert.equal(must(claimJob(released)).kind, 'AwaitingHandoff'); // คว้าใหม่ได้
});

test('ปลดงานที่ยังไม่ถูกคว้าไม่ได้', () => {
  assert.match(rejected(releaseClaim(placeOrder())), /งานยังไม่ถูกคว้า/);
});

// ─── ยกเลิก / หมดเวลา ──────────────────────────────────────────────────────────

test('ลูกค้ายกเลิก: ในหน้าต่างฟรี + ยังไม่มีไรเดอร์ เท่านั้น', () => {
  // ในหน้าต่างฟรี ยังไม่มีไรเดอร์ → ได้
  assert.equal(must(cancelByCustomer(placeOrder(), { withinFreeWindow: true })).kind, 'CancelledByCustomer');
  // พ้นหน้าต่างฟรี → ไม่ได้
  assert.match(rejected(cancelByCustomer(placeOrder(), { withinFreeWindow: false })), /พ้นหน้าต่างยกเลิกฟรี/);
  // มีไรเดอร์คว้าแล้ว → ไม่ได้ แม้อยู่ในหน้าต่างฟรี
  assert.match(
    rejected(cancelByCustomer(awaiting('accept', 'claimed'), { withinFreeWindow: true })),
    /มีไรเดอร์รับงานแล้ว/,
  );
});

test('Delivery Timeout: เฉพาะตอนยังไม่มีไรเดอร์', () => {
  assert.equal(must(deliveryTimeout(placeOrder())).kind, 'DeliveryTimeout');
  assert.match(rejected(deliveryTimeout(awaiting('accept', 'claimed'))), /มีไรเดอร์รับงานแล้ว/);
});

// ─── in-transit / ปลายทาง ──────────────────────────────────────────────────────

test('ปิดออเดอร์ต้องมี OTP ถูกต้อง', () => {
  let s = must(pickup(awaiting('ready', 'atMerchant')));
  assert.match(rejected(confirmDelivery(s, { otpMatches: true })), /ยังไม่ถึงที่อยู่ลูกค้า/);
  s = must(riderArriveAtCustomer(s));
  assert.match(rejected(confirmDelivery(s, { otpMatches: false })), /OTP ไม่ถูกต้อง/);
  assert.equal(must(confirmDelivery(s, { otpMatches: true })).kind, 'Completed');
});

test('ส่งไม่ได้: ต้องถึงที่อยู่ + พยายามครบเกณฑ์', () => {
  let s = must(pickup(awaiting('ready', 'atMerchant')));
  assert.match(rejected(declareFailedDelivery(s, { attemptsExhausted: true })), /ยังไม่ถึงที่อยู่ลูกค้า/);
  s = must(riderArriveAtCustomer(s));
  assert.match(rejected(declareFailedDelivery(s, { attemptsExhausted: false })), /ยังพยายามไม่ครบเกณฑ์/);
  assert.equal(must(declareFailedDelivery(s, { attemptsExhausted: true })).kind, 'FailedDelivery');
});

// ─── terminal ──────────────────────────────────────────────────────────────────

test('isTerminal ถูกต้อง และ terminal เปลี่ยนต่อไม่ได้', () => {
  const completed = must(confirmDelivery(
    must(riderArriveAtCustomer(must(pickup(awaiting('ready', 'atMerchant'))))),
    { otpMatches: true },
  ));
  assert.ok(isTerminal(completed));
  assert.ok(!isTerminal(placeOrder()));
  // จาก terminal ทำ transition ใดๆ ไม่ได้
  assert.match(rejected(merchantAccept(completed)), /ในสถานะ Completed/);
  assert.match(rejected(claimJob(completed)), /ในสถานะ Completed/);
});
