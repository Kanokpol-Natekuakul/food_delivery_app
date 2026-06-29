import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../settlement/settlement.js';
import { balance, post, accounts, postSettlement, postGoodwill, payout, isPayable, payableAccounts, runSettlement, isSettlementDueAt, nextSettlementAt, CADENCE_MS, MIN_PAYOUT, PLATFORM, RIDER_POOL, REFUNDS } from './wallet.js';

const A = { food: 100, delivery: 29, service: 9 }; // total 138

test('balance ว่าง = 0; post แล้วบวกสะสม', () => {
  let l = post([], { account: 'platform', amount: 9, kind: 'credit', orderId: '1', memo: '' });
  l = post(l, { account: 'platform', amount: 5, kind: 'credit', orderId: '2', memo: '' });
  assert.equal(balance(l, 'platform'), 14);
  assert.equal(balance(l, 'rider'), 0);
});

test('postSettlement Completed: เครดิตยอดสุทธิหลังแตกส่วนแบ่ง (ADR 0003), ไม่มี refund', () => {
  const l = postSettlement([], 'o1', 'merchant:shop', settle({ kind: 'Completed' }, A)!);
  assert.equal(balance(l, 'merchant:shop'), 70); // 100 − คอม 30
  assert.equal(balance(l, RIDER_POOL), 23);      // 29 − ส่วนแบ่ง 6
  assert.equal(balance(l, PLATFORM), 45);        // คอม 30 + บริการ 9 + ส่วนแบ่ง 6
  assert.equal(balance(l, REFUNDS), 0);
});

test('postSettlement DeliveryTimeout: ร้านได้ค่าอาหาร แพลตฟอร์มติดลบ + บันทึก refund', () => {
  const l = postSettlement([], 'o2', 'merchant:shop', settle({ kind: 'DeliveryTimeout' }, A)!);
  assert.equal(balance(l, 'merchant:shop'), 100);
  assert.equal(balance(l, PLATFORM), -100);
  assert.equal(balance(l, RIDER_POOL), 0); // ไม่โพสต์ entry ที่เป็น 0
  assert.equal(balance(l, REFUNDS), 138);
});

test('payout: โอนออกทำให้ยอดเหลือ 0 + เพิ่มรายการ; ยอด 0 แล้วไม่โอนซ้ำ', () => {
  let l = postSettlement([], 'o1', 'merchant:shop', settle({ kind: 'Completed' }, A)!);
  const before = l.length;
  l = payout(l, 'merchant:shop');
  assert.equal(balance(l, 'merchant:shop'), 0);
  assert.equal(l.length, before + 1);
  assert.equal(payout(l, 'merchant:shop').length, l.length); // ยอด 0 → ไม่เพิ่ม
});

test('postGoodwill: คืน goodwill หลังส่ง — แพลตฟอร์มติดลบ + บันทึก refund; 0 ไม่โพสต์', () => {
  const l = postGoodwill([], 'd1', 80);
  assert.equal(balance(l, PLATFORM), -80);
  assert.equal(balance(l, REFUNDS), 80);
  assert.equal(postGoodwill(l, 'd2', 0).length, l.length); // ยอด 0 → ไม่เพิ่ม
});

test('accounts: คืนรายชื่อบัญชีไม่ซ้ำ', () => {
  const l = postSettlement([], 'o1', 'merchant:shop', settle({ kind: 'Completed' }, A)!);
  const acc = accounts(l);
  assert.ok(acc.includes('merchant:shop') && acc.includes(RIDER_POOL) && acc.includes(PLATFORM));
  assert.equal(new Set(acc).size, acc.length);
});

// ── รอบ settlement + ยอดถอนขั้นต่ำ (ADR 0004) ──
test('isPayable: ถึงยอดถอนขั้นต่ำจึงจ่ายออกได้', () => {
  const ok = post([], { account: 'a', amount: MIN_PAYOUT, kind: 'credit', orderId: '1', memo: '' });
  const low = post([], { account: 'b', amount: MIN_PAYOUT - 1, kind: 'credit', orderId: '1', memo: '' });
  assert.equal(isPayable(ok, 'a'), true);
  assert.equal(isPayable(low, 'b'), false);
});

test('payableAccounts: เฉพาะบัญชีที่ถึงเกณฑ์ ไม่รวม REFUNDS', () => {
  let l = post([], { account: 'rich', amount: 120, kind: 'credit', orderId: '1', memo: '' });
  l = post(l, { account: 'poor', amount: 20, kind: 'credit', orderId: '1', memo: '' });
  l = post(l, { account: REFUNDS, amount: 200, kind: 'refund', orderId: '1', memo: '' });
  assert.deepEqual(payableAccounts(l), ['rich']);
});

test('isSettlementDueAt: ครบรอบตามเวลาจริง (ms) เทียบรอบล่าสุด', () => {
  const DAY = 24 * 60 * 60 * 1000;
  assert.equal(CADENCE_MS.daily, DAY);
  assert.equal(CADENCE_MS.weekly, 7 * DAY);
  const t0 = 1_700_000_000_000;
  assert.equal(nextSettlementAt(t0, 'daily'), t0 + DAY);
  assert.equal(isSettlementDueAt(t0, t0, 'daily'), false);           // เพิ่งรันไป
  assert.equal(isSettlementDueAt(t0 + DAY - 1, t0, 'daily'), false); // ยังไม่ถึงเสี้ยววินาที
  assert.equal(isSettlementDueAt(t0 + DAY, t0, 'daily'), true);      // ครบพอดี
  assert.equal(isSettlementDueAt(t0 + 6 * DAY, t0, 'weekly'), false);
  assert.equal(isSettlementDueAt(t0 + 7 * DAY, t0, 'weekly'), true);
});

test('runSettlement: รอบเดียวจ่ายทุกบัญชีที่ถึงเกณฑ์ ข้ามที่ยังไม่ถึง + ไม่แตะ REFUNDS', () => {
  let l = post([], { account: 'rich', amount: 120, kind: 'credit', orderId: '1', memo: '' });
  l = post(l, { account: 'poor', amount: 20, kind: 'credit', orderId: '1', memo: '' });
  l = post(l, { account: REFUNDS, amount: 200, kind: 'refund', orderId: '1', memo: '' });
  const after = runSettlement(l);
  assert.equal(balance(after, 'rich'), 0);    // จ่ายออกแล้ว
  assert.equal(balance(after, 'poor'), 20);   // ต่ำกว่าขั้นต่ำ สะสมรอบหน้า
  assert.equal(balance(after, REFUNDS), 200); // บัญชีติดตามการคืน ไม่ถูกถอน
});
