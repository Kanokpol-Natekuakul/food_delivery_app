import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_CANCELLATION_WINDOW_SEC,
  DELIVERY_TIMEOUT_MIN,
  CLAIM_EXPIRY_MIN,
  FAILED_DELIVERY_WAIT_MIN,
  FAILED_DELIVERY_MIN_CALLS,
  isWithinFreeWindow,
  isDeliveryTimedOut,
  isClaimExpired,
  isAttemptsExhausted,
  isPriorityHeld,
  RIDER_PRIORITY_WINDOW_SEC,
} from './timers.js';

test('ค่าตัวจับเวลาเป็นไปตาม policy (90 วิ / 15 / 8 นาที, ส่งไม่ได้ 10 นาที+3 สาย)', () => {
  assert.equal(FREE_CANCELLATION_WINDOW_SEC, 90);
  assert.equal(DELIVERY_TIMEOUT_MIN, 15);
  assert.equal(CLAIM_EXPIRY_MIN, 8);
  assert.equal(FAILED_DELIVERY_WAIT_MIN, 10);
  assert.equal(FAILED_DELIVERY_MIN_CALLS, 3);
});

test('หน้าต่างยกเลิกฟรี: ภายใน 90 วิ ยกเลิกฟรีได้ (รวมพอดี 90), พ้นแล้วไม่ได้', () => {
  assert.equal(isWithinFreeWindow(0), true);
  assert.equal(isWithinFreeWindow(89), true);
  assert.equal(isWithinFreeWindow(90), true); // ขอบเขตยังนับว่าอยู่ในหน้าต่าง
  assert.equal(isWithinFreeWindow(91), false);
});

test('Delivery Timeout (Y): ไม่มีไรเดอร์ครบ 15 นาที = หมดเวลา', () => {
  assert.equal(isDeliveryTimedOut(14), false);
  assert.equal(isDeliveryTimedOut(15), true); // ครบกำหนด = ทริกเกอร์
  assert.equal(isDeliveryTimedOut(16), true);
});

test('Claim Expiry (Z): ไรเดอร์ไม่คืบหน้าครบ 8 นาที = ปลดงานคืนลิสต์', () => {
  assert.equal(isClaimExpired(7), false);
  assert.equal(isClaimExpired(8), true);
});

test('Failed Delivery: ต้องรอครบ 10 นาที และโทรครบ 3 ครั้ง (เงื่อนไข AND)', () => {
  assert.equal(isAttemptsExhausted(10, 3), true);
  assert.equal(isAttemptsExhausted(9, 3), false); // เวลาไม่ครบ
  assert.equal(isAttemptsExhausted(10, 2), false); // โทรไม่ครบ
  assert.equal(isAttemptsExhausted(12, 5), true);
});

test('predicates รับเกณฑ์ override ได้ (เผื่อทดสอบ/ปรับ policy ภายหลัง)', () => {
  assert.equal(isWithinFreeWindow(100, 120), true);
  assert.equal(isDeliveryTimedOut(10, 20), false);
  assert.equal(isClaimExpired(6, 5), true);
});

test('isPriorityHeld: เฉพาะไรเดอร์ที่ถูกลดอันดับ + ยังรอไม่ครบช่วง', () => {
  assert.equal(RIDER_PRIORITY_WINDOW_SEC, 30);
  assert.equal(isPriorityHeld(false, 0), false);            // ไม่ถูกลดอันดับ → คว้าได้เลย
  assert.equal(isPriorityHeld(true, 0), true);              // ลดอันดับ + เพิ่งเริ่ม → ติดช่วงรอ
  assert.equal(isPriorityHeld(true, RIDER_PRIORITY_WINDOW_SEC), false); // ครบช่วงแล้ว → คว้าได้
  assert.equal(isPriorityHeld(true, 10, 30), true);         // override window
});
