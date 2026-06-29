import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suspend, unsuspend, isSuspended, rankByStanding } from './moderation.js';

test('suspend / isSuspended / unsuspend ทำงานเป็น set (ไม่ซ้ำ, ไม่กลายพันธุ์)', () => {
  const empty: readonly string[] = [];
  const one = suspend(empty, 'rider:somchai');
  assert.equal(isSuspended(one, 'rider:somchai'), true);
  assert.equal(isSuspended(one, 'rider:other'), false);
  assert.equal(empty.length, 0); // ของเดิมไม่เปลี่ยน

  const again = suspend(one, 'rider:somchai'); // ซ้ำ → ไม่เพิ่ม
  assert.equal(again.length, 1);

  const back = unsuspend(one, 'rider:somchai');
  assert.equal(isSuspended(back, 'rider:somchai'), false);
});

test('rankByStanding: ฝ่ายที่ถูกลดอันดับไปอยู่ท้าย โดยคงลำดับเดิมในแต่ละกลุ่ม (stable)', () => {
  const items = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
  ];
  const ranked = rankByStanding(items, (x) => `merchant:${x.id}`, ['merchant:a', 'merchant:c']);
  assert.deepEqual(ranked.map((x) => x.id), ['b', 'd', 'a', 'c']); // ปกติ b,d ก่อน แล้วค่อย a,c (คงลำดับเดิม)
  // ไม่กลายพันธุ์ของเดิม
  assert.deepEqual(items.map((x) => x.id), ['a', 'b', 'c', 'd']);
});

test('rankByStanding: ไม่มีใครถูกลดอันดับ → ลำดับเดิมทั้งหมด', () => {
  const items = [{ id: 'x' }, { id: 'y' }];
  assert.deepEqual(rankByStanding(items, (x) => x.id, []).map((x) => x.id), ['x', 'y']);
});
