import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderState } from './state.js';
import { merchantView } from './merchantView.js';

const awaiting = (
  merchant: 'PendingAccept' | 'Preparing' | 'Ready',
  rider: 'Unclaimed' | 'Claimed' | 'AtMerchant' = 'Unclaimed',
): OrderState => ({ kind: 'AwaitingHandoff', merchant, rider });

test('รอร้านรับ (PendingAccept): กดรับ/ปฏิเสธได้ และยัง active', () => {
  const v = merchantView(awaiting('PendingAccept'));
  assert.deepEqual(v.actions, ['accept', 'reject']);
  assert.equal(v.active, true);
  assert.equal(v.stageLabel, 'รอร้านรับออเดอร์');
});

test('กำลังทำ (Preparing): กดอาหารเสร็จ/ปฏิเสธได้', () => {
  const v = merchantView(awaiting('Preparing'));
  assert.deepEqual(v.actions, ['markReady', 'reject']);
  assert.equal(v.active, true);
  assert.equal(v.stageLabel, 'กำลังทำอาหาร');
});

test('อาหารเสร็จ (Ready): ไม่มี action (ปฏิเสธไม่ได้แล้ว) แต่ยัง active รอไรเดอร์', () => {
  const v = merchantView(awaiting('Ready', 'AtMerchant'));
  assert.deepEqual(v.actions, []);
  assert.equal(v.active, true);
  assert.equal(v.stageLabel, 'อาหารเสร็จ รอไรเดอร์มารับ');
});

test('ไรเดอร์รับอาหารไปแล้ว (InTransit): ร้านจบหน้าที่ ไม่ active', () => {
  const v = merchantView({ kind: 'InTransit', rider: 'Delivering' });
  assert.deepEqual(v.actions, []);
  assert.equal(v.active, false);
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
    const v = merchantView(state);
    assert.deepEqual(v.actions, [], `${state.kind} ควรไม่มี action`);
    assert.equal(v.active, false, `${state.kind} ควรไม่ active`);
  }
});
