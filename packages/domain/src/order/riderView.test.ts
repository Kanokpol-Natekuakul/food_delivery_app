import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderState } from './state.js';
import { riderView } from './riderView.js';

const awaiting = (
  merchant: 'PendingAccept' | 'Preparing' | 'Ready',
  rider: 'Unclaimed' | 'Claimed' | 'AtMerchant',
): OrderState => ({ kind: 'AwaitingHandoff', merchant, rider });

test('งานใหม่ (Unclaimed): คว้างานได้', () => {
  const v = riderView(awaiting('PendingAccept', 'Unclaimed'));
  assert.deepEqual(v.actions, ['claim']);
  assert.equal(v.active, true);
  assert.equal(v.stageLabel, 'มีงานใหม่ รอไรเดอร์คว้า');
});

test('คว้าแล้ว (Claimed): ไปถึงร้าน หรือคืนงาน', () => {
  const v = riderView(awaiting('Preparing', 'Claimed'));
  assert.deepEqual(v.actions, ['arriveAtMerchant', 'release']);
  assert.equal(v.stageLabel, 'รับงานแล้ว กำลังไปร้าน');
});

test('ถึงร้านแต่อาหารยังไม่เสร็จ: รับอาหารไม่ได้ (เหลือแค่คืนงาน)', () => {
  const v = riderView(awaiting('Preparing', 'AtMerchant'));
  assert.deepEqual(v.actions, ['release']);
  assert.equal(v.stageLabel, 'ถึงร้านแล้ว รออาหารเสร็จ');
});

test('จุดบรรจบ: อาหารเสร็จ + ไรเดอร์ถึงร้าน → รับอาหารได้', () => {
  const v = riderView(awaiting('Ready', 'AtMerchant'));
  assert.deepEqual(v.actions, ['pickup']);
  assert.equal(v.active, true);
  assert.equal(v.stageLabel, 'อาหารพร้อม รับได้เลย');
});

test('กำลังส่ง (Delivering): กดถึงหน้าบ้าน', () => {
  const v = riderView({ kind: 'InTransit', rider: 'Delivering' });
  assert.deepEqual(v.actions, ['arriveAtCustomer']);
  assert.equal(v.stageLabel, 'กำลังไปส่งลูกค้า');
});

test('ถึงหน้าบ้าน (AtCustomer): ยืนยัน OTP หรือประกาศส่งไม่ได้', () => {
  const v = riderView({ kind: 'InTransit', rider: 'AtCustomer' });
  assert.deepEqual(v.actions, ['confirmDelivery', 'declareFailed']);
  assert.equal(v.stageLabel, 'ถึงหน้าบ้านลูกค้า');
});

test('terminal ทุกแบบ: ไม่มี action และไม่ active', () => {
  for (const state of [
    { kind: 'Completed' },
    { kind: 'RejectedByMerchant' },
    { kind: 'CancelledByCustomer' },
    { kind: 'DeliveryTimeout' },
    { kind: 'FailedDelivery' },
    { kind: 'CancelledByAdmin' },
  ] as const) {
    const v = riderView(state);
    assert.deepEqual(v.actions, [], `${state.kind} ควรไม่มี action`);
    assert.equal(v.active, false, `${state.kind} ควรไม่ active`);
  }
});
