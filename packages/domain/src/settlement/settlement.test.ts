import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderState } from '../order/state.js';
import { settle } from './settlement.js';

const A = { food: 100, delivery: 29, service: 9 }; // total = 138

test('ออเดอร์ที่ยังไม่จบ → ไม่มี settlement (null)', () => {
  assert.equal(settle({ kind: 'AwaitingHandoff', merchant: 'Preparing', rider: 'Claimed' }, A), null);
  assert.equal(settle({ kind: 'InTransit', rider: 'Delivering' }, A), null);
});

test('Completed: แตกส่วนแบ่ง (ADR 0003) — ร้าน=อาหาร−คอม, ไรเดอร์=ส่ง−แบ่ง, แพลตฟอร์ม=คอม+บริการ+แบ่ง', () => {
  const s = settle({ kind: 'Completed' }, A)!;
  assert.equal(s.fault, 'none');
  assert.equal(s.customerRefund, 0);
  assert.equal(s.merchantPayout, 70);  // 100 − คอม 30
  assert.equal(s.riderPayout, 23);     // 29 − ส่วนแบ่ง 6
  assert.equal(s.platformNet, 45);     // คอม 30 + บริการ 9 + ส่วนแบ่ง 6
  // เงินเข้า = ยอดที่ลูกค้าจ่าย (เงินไม่หาย)
  assert.equal(s.merchantPayout + s.riderPayout + s.platformNet, 138);
  // มีบันทึกการแตกเงินไว้ตรวจย้อน
  assert.equal(s.split?.commission, 30);
  assert.equal(s.split?.deliveryShare, 6);
});

test('FailedDelivery: ลูกค้าผิด ไม่คืนเงิน · แตกส่วนแบ่งเหมือนสำเร็จ (อาหารเป็นของไรเดอร์)', () => {
  const s = settle({ kind: 'FailedDelivery' }, A)!;
  assert.equal(s.fault, 'customer');
  assert.equal(s.customerRefund, 0);
  assert.equal(s.merchantPayout, 70);
  assert.equal(s.riderPayout, 23);
  assert.equal(s.platformNet, 45);
  assert.notEqual(s.split, null);
});

test('เคสคืนเต็ม/ล้มเหลว: ไม่มีรายได้เกิด → split = null', () => {
  assert.equal(settle({ kind: 'RejectedByMerchant' }, A)!.split, null);
  assert.equal(settle({ kind: 'CancelledByCustomer' }, A)!.split, null);
  assert.equal(settle({ kind: 'DeliveryTimeout' }, A)!.split, null);
  assert.equal(settle({ kind: 'CancelledByAdmin' }, A)!.split, null);
});

test('RejectedByMerchant: ร้านผิด → ลูกค้าคืนเต็ม', () => {
  const s = settle({ kind: 'RejectedByMerchant' }, A)!;
  assert.equal(s.fault, 'merchant');
  assert.equal(s.customerRefund, 138);
  assert.equal(s.riderPayout, 0);
});

test('CancelledByCustomer (หน้าต่างฟรี): ไม่มีใครผิด → คืนเต็ม + แพลตฟอร์มกลืนค่าอาหาร', () => {
  const s = settle({ kind: 'CancelledByCustomer' }, A)!;
  assert.equal(s.fault, 'none');
  assert.equal(s.customerRefund, 138);
  assert.equal(s.merchantPayout, 100);
  assert.equal(s.platformNet, -100); // แพลตฟอร์มแบกค่าอาหาร
});

test('DeliveryTimeout: ไม่มีไรเดอร์ → คืนเต็ม + แพลตฟอร์มกลืนค่าอาหาร (เหมือนยกเลิกฟรี)', () => {
  const s = settle({ kind: 'DeliveryTimeout' }, A)!;
  assert.equal(s.fault, 'none');
  assert.equal(s.customerRefund, 138);
  assert.equal(s.platformNet, -100);
});

test('CancelledByAdmin: แอดมินบังคับยกเลิก → ไม่มีใครผิด คืนเต็ม + แพลตฟอร์มรับผิดชอบค่าอาหาร', () => {
  const s = settle({ kind: 'CancelledByAdmin' }, A)!;
  assert.equal(s.fault, 'none');
  assert.equal(s.customerRefund, 138);
  assert.equal(s.platformNet, -100);
});
