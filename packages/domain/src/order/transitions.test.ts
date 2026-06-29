import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOrder, adminCancel, claimJob } from './transitions.js';

test('adminCancel: ออเดอร์ที่ยังไม่จบ → CancelledByAdmin', () => {
  const r = adminCancel(placeOrder());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.state.kind, 'CancelledByAdmin');
});

test('adminCancel: ออเดอร์ที่จบแล้ว → ปฏิเสธ (ยกเลิกซ้ำไม่ได้)', () => {
  assert.equal(adminCancel({ kind: 'Completed' }).ok, false);
  assert.equal(adminCancel({ kind: 'CancelledByAdmin' }).ok, false);
});

test('claimJob: ไรเดอร์ปกติ → คว้างานได้', () => {
  const r = claimJob(placeOrder());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.state.kind === 'AwaitingHandoff' && r.state.rider, 'Claimed');
});

test('claimJob: ไรเดอร์ถูกพักงาน → คว้างานไม่ได้', () => {
  const r = claimJob(placeOrder(), { riderSuspended: true });
  assert.equal(r.ok, false);
});

test('claimJob: ติดช่วงให้สิทธิ์อันดับสูงก่อน (ถูกลดอันดับ) → คว้างานไม่ได้', () => {
  const r = claimJob(placeOrder(), { priorityHeld: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /ลดอันดับ/);
});
