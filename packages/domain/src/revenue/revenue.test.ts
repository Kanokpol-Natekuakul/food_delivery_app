import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRevenue, resolveRates, requestRate, approveRate, rejectRate, counterRate, acceptCounter, declineCounter, agreedRate, DEFAULT_RATES, COMMISSION_RATE, DELIVERY_SHARE_RATE } from './revenue.js';
import type { RatePolicy, RateRequest } from './revenue.js';

const A = { food: 100, delivery: 29, service: 9 }; // total = 138

test('ค่าตั้งต้น: คอมมิชชัน 30% ของค่าอาหาร + ส่วนแบ่งค่าส่ง 20%', () => {
  assert.equal(DEFAULT_RATES.commissionRate, COMMISSION_RATE);
  assert.equal(DEFAULT_RATES.deliveryShareRate, DELIVERY_SHARE_RATE);
  assert.equal(COMMISSION_RATE, 0.3);
  assert.equal(DELIVERY_SHARE_RATE, 0.2);
});

test('splitRevenue: แตกก้อนตาม ADR 0003 (ร้าน=อาหาร−คอม, ไรเดอร์=ส่ง−แบ่ง, แพลตฟอร์ม=คอม+บริการ+แบ่ง)', () => {
  const r = splitRevenue(A);
  assert.equal(r.commission, 30);       // 100 × 30%
  assert.equal(r.merchantNet, 70);      // 100 − 30
  assert.equal(r.deliveryShare, 6);     // round(29 × 20% = 5.8)
  assert.equal(r.riderNet, 23);         // 29 − 6
  assert.equal(r.serviceFee, 9);
  assert.equal(r.platformGross, 45);    // 30 + 9 + 6
});

test('splitRevenue: ผลรวมก้อนสุทธิ = ยอดที่ลูกค้าจ่าย (เงินไม่หาย)', () => {
  const r = splitRevenue(A);
  assert.equal(r.merchantNet + r.riderNet + r.platformGross, A.food + A.delivery + A.service);
});

test('splitRevenue: อัตรากำหนดเองได้ + ปัดเป็นบาท', () => {
  const r = splitRevenue({ food: 55, delivery: 22, service: 9 }, { commissionRate: 0.25, deliveryShareRate: 0.1 });
  assert.equal(r.commission, 14);   // round(55 × 0.25 = 13.75)
  assert.equal(r.merchantNet, 41);  // 55 − 14
  assert.equal(r.deliveryShare, 2); // round(22 × 0.1 = 2.2)
  assert.equal(r.riderNet, 20);     // 22 − 2
  assert.equal(r.platformGross, 25); // 14 + 9 + 2
  assert.equal(r.merchantNet + r.riderNet + r.platformGross, 86);
});

// ── อัตราต่อร้าน/โซน (ADR 0003: อัตราเป็นพารามิเตอร์กำหนดทีหลัง) ──
const POLICY: RatePolicy = {
  base: { commissionRate: 0.3, deliveryShareRate: 0.2 },
  byZone: { outer: { deliveryShareRate: 0.1 } },        // โซนไกล แบ่งค่าส่งน้อยลง
  byMerchant: { shopA: { commissionRate: 0.2 } },        // ร้านเจรจาคอมต่ำ
};

test('resolveRates: ไม่มี override → base', () => {
  assert.deepEqual(resolveRates(POLICY), POLICY.base);
  assert.deepEqual(resolveRates(POLICY, 'unknown', 'unknown'), POLICY.base);
});

test('resolveRates: โซน override เฉพาะคีย์ที่กำหนด (merge ทับ base)', () => {
  assert.deepEqual(resolveRates(POLICY, undefined, 'outer'), { commissionRate: 0.3, deliveryShareRate: 0.1 });
});

test('resolveRates: precedence ร้าน > โซน > base', () => {
  // ร้าน override คอม, โซน override ค่าส่ง → รวมกันคนละก้อน
  assert.deepEqual(resolveRates(POLICY, 'shopA', 'outer'), { commissionRate: 0.2, deliveryShareRate: 0.1 });
  // ร้านอย่างเดียว → คอมจากร้าน, ค่าส่งจาก base
  assert.deepEqual(resolveRates(POLICY, 'shopA'), { commissionRate: 0.2, deliveryShareRate: 0.2 });
});

test('resolveRates: ใช้กับ splitRevenue ได้จริง — ร้านคอมต่ำ ร้านได้มากขึ้น', () => {
  const base = splitRevenue({ food: 100, delivery: 20, service: 9 }, resolveRates(POLICY));
  const shopA = splitRevenue({ food: 100, delivery: 20, service: 9 }, resolveRates(POLICY, 'shopA'));
  assert.equal(base.merchantNet, 70);   // คอม 30
  assert.equal(shopA.merchantNet, 80);  // คอม 20
});

// ── เจรจาอัตราคอมมิชชัน (ADR 0003: อัตราเป็นพารามิเตอร์เจรจาได้) ──
const REQ = { id: 'rq1', merchantId: 'shopA', currentRate: 0.3, proposedRate: 0.25, reason: 'ยอดขายสูง' };

test('requestRate: เสนออัตราต่ำกว่าปัจจุบันในช่วง 0–100% → คำขอ pending', () => {
  const r = requestRate(REQ);
  assert.ok(r.ok);
  assert.equal(r.request.status, 'pending');
  assert.equal(r.request.proposedRate, 0.25);
});

test('requestRate: เสนอ ≥ ปัจจุบัน หรือ นอกช่วง 0–1 → ปฏิเสธ', () => {
  assert.equal(requestRate({ ...REQ, proposedRate: 0.3 }).ok, false);  // ไม่ต่ำกว่าปัจจุบัน
  assert.equal(requestRate({ ...REQ, proposedRate: 0 }).ok, false);    // 0%
  assert.equal(requestRate({ ...REQ, proposedRate: 1 }).ok, false);    // 100%
});

test('approveRate/rejectRate: เปลี่ยนจาก pending เท่านั้น; ทำซ้ำไม่ได้', () => {
  const req = (requestRate(REQ) as { ok: true; request: RateRequest }).request;
  const ap = approveRate(req);
  assert.ok(ap.ok);
  assert.equal(ap.request.status, 'approved');
  assert.equal(approveRate(ap.request).ok, false); // อนุมัติแล้ว ทำซ้ำไม่ได้
  const rj = rejectRate(req);
  assert.ok(rj.ok);
  assert.equal(rj.request.status, 'rejected');
});

test('agreedRate: ไม่มีข้อเสนอแย้ง → ใช้ที่ร้านขอ', () => {
  const req = (requestRate(REQ) as { ok: true; request: RateRequest }).request;
  assert.equal(agreedRate(req), 0.25);
});

test('counterRate: แอดมินเสนอแย้งระหว่างที่ร้านขอกับอัตราปัจจุบัน → countered', () => {
  const req = (requestRate(REQ) as { ok: true; request: RateRequest }).request; // current 0.3, proposed 0.25
  const c = counterRate(req, 0.27);
  assert.ok(c.ok);
  assert.equal(c.request.status, 'countered');
  assert.equal(c.request.counterRate, 0.27);
});

test('counterRate: นอกช่วง (≤ที่ขอ หรือ ≥ปัจจุบัน) หรือไม่ใช่ pending → ปฏิเสธ', () => {
  const req = (requestRate(REQ) as { ok: true; request: RateRequest }).request;
  assert.equal(counterRate(req, 0.25).ok, false); // = ที่ร้านขอ
  assert.equal(counterRate(req, 0.3).ok, false);  // = ปัจจุบัน
  assert.equal(counterRate(req, 0.2).ok, false);  // ต่ำกว่าที่ร้านขอ
  const approved = (approveRate(req) as { ok: true; request: RateRequest }).request;
  assert.equal(counterRate(approved, 0.27).ok, false); // ไม่ใช่ pending
});

test('acceptCounter/declineCounter: ตอบจาก countered เท่านั้น; ตอบรับใช้ counterRate', () => {
  const req = (requestRate(REQ) as { ok: true; request: RateRequest }).request;
  const countered = (counterRate(req, 0.27) as { ok: true; request: RateRequest }).request;
  const acc = acceptCounter(countered);
  assert.ok(acc.ok);
  assert.equal(acc.request.status, 'approved');
  assert.equal(agreedRate(acc.request), 0.27); // ใช้ข้อเสนอแย้ง ไม่ใช่ที่ขอเดิม
  const dec = declineCounter(countered);
  assert.ok(dec.ok);
  assert.equal(dec.request.status, 'rejected');
  assert.equal(acceptCounter(req).ok, false); // req ยัง pending ไม่ใช่ countered
});
