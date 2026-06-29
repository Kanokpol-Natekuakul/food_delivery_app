import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileComplaint,
  resolveGoodwill,
  reject,
  complaintsAgainst,
  complaintsBy,
  complaintRate,
  flag,
  flagParty,
  flagCustomer,
  autoActions,
  planAutoActions,
  COMPLAINT_WINDOW_MIN,
  MIN_ORDERS_FOR_RATE,
  PARTY_RATE_LIMIT,
  type Dispute,
} from './dispute.js';

const INPUT = {
  id: 'd1',
  orderId: '1039',
  customer: 'customer:aon',
  merchant: 'merchant:khao-man-kai',
  rider: 'rider:somchai',
  category: 'wrong_item' as const,
  hasPhoto: true,
};

test('fileComplaint: ออเดอร์สำเร็จ + แนบรูป + ในหน้าต่าง → เปิดเคส (open, ยังไม่คืนเงิน)', () => {
  const r = fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: 30 });
  assert.ok(r.ok);
  assert.equal(r.dispute.status, 'open');
  assert.equal(r.dispute.refund, 0);
  assert.equal(r.dispute.category, 'wrong_item');
});

test('fileComplaint: ร้องเรียนได้เฉพาะออเดอร์ที่ส่งสำเร็จแล้ว', () => {
  const r = fileComplaint(INPUT, { orderKind: 'InTransit', minutesSinceCompleted: 0 });
  assert.equal(r.ok, false);
});

test('fileComplaint: ต้องแนบรูปเป็นหลักฐาน (ADR 0006)', () => {
  const r = fileComplaint({ ...INPUT, hasPhoto: false }, { orderKind: 'Completed', minutesSinceCompleted: 5 });
  assert.equal(r.ok, false);
});

test('fileComplaint: เลยหน้าต่างร้องเรียน → ปฏิเสธ', () => {
  const r = fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: COMPLAINT_WINDOW_MIN + 1 });
  assert.equal(r.ok, false);
});

test('resolveGoodwill: คืนเงิน goodwill ปิดเคส; ปิดแล้วปิดซ้ำไม่ได้', () => {
  const open = (fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const r = resolveGoodwill(open, 100);
  assert.ok(r.ok);
  assert.equal(r.dispute.status, 'refunded');
  assert.equal(r.dispute.refund, 100);
  assert.equal(resolveGoodwill(r.dispute, 50).ok, false); // ปิดแล้ว
});

test('reject: ปฏิเสธคำร้อง (สงสัยโกง) ปิดเคสโดยไม่คืนเงิน', () => {
  const open = (fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const r = reject(open);
  assert.ok(r.ok);
  assert.equal(r.dispute.status, 'rejected');
  assert.equal(r.dispute.refund, 0);
});

test('complaintsAgainst: นับเคสรายฝ่าย (ไม่นับเคสที่ถูกปฏิเสธ = สัญญาณลดอันดับ)', () => {
  const open = (fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const refunded = (resolveGoodwill(open, 80) as { ok: true; dispute: Dispute }).dispute;
  const other = (fileComplaint({ ...INPUT, id: 'd2', rider: 'rider:nid' }, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const rejected = (reject(other) as { ok: true; dispute: Dispute }).dispute;
  const list = [refunded, rejected];
  assert.equal(complaintsAgainst(list, 'merchant:khao-man-kai'), 1); // ทั้งสองเคสร้านเดียวกัน แต่ rejected ไม่นับ
  assert.equal(complaintsAgainst(list, 'rider:somchai'), 1);
  assert.equal(complaintsAgainst(list, 'rider:nid'), 0); // เคสนี้ถูกปฏิเสธ
});

test('complaintsBy: นับเคสที่ลูกค้ารายนี้ยื่นทั้งหมด (สัญญาณกันโกง)', () => {
  const a = (fileComplaint(INPUT, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const b = (fileComplaint({ ...INPUT, id: 'd2' }, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;
  const rejected = (reject(b) as { ok: true; dispute: Dispute }).dispute;
  assert.equal(complaintsBy([a, rejected], 'customer:aon'), 2); // นับทั้งที่ถูกปฏิเสธ
  assert.equal(complaintsBy([a, rejected], 'customer:nok'), 0);
});

// ── เกณฑ์สถิติ (ADR 0006): อัตราร้องเรียน + ระดับการจัดการ ──
const mkOpen = (id: string, over: Partial<Dispute> = {}): Dispute =>
  (fileComplaint({ ...INPUT, id, ...over }, { orderKind: 'Completed', minutesSinceCompleted: 1 }) as { ok: true; dispute: Dispute }).dispute;

test('complaintRate: #เคส/#ออเดอร์; ไม่มีออเดอร์ → 0 (กันหารศูนย์)', () => {
  assert.equal(complaintRate(2, 8), 0.25);
  assert.equal(complaintRate(0, 10), 0);
  assert.equal(complaintRate(3, 0), 0);
});

test('flag: ไม่มีเคส→ok; ตัวอย่างน้อยแต่มีเคส→watch; เกินเกณฑ์→action; เท่าเกณฑ์พอดี→watch', () => {
  assert.equal(flag(0, 100, PARTY_RATE_LIMIT), 'ok');
  assert.equal(flag(1, MIN_ORDERS_FOR_RATE - 1, PARTY_RATE_LIMIT), 'watch'); // ตัวอย่างไม่พอตัดสินอัตรา
  assert.equal(flag(3, 10, 0.2), 'action');   // 0.3 > 0.2
  assert.equal(flag(2, 10, 0.2), 'watch');    // 0.2 ไม่เกิน (ใช้ >)
});

test('flagParty: นับเฉพาะเคสที่ไม่ถูกปฏิเสธ แล้วตัดสินด้วยอัตรา', () => {
  // ร้านเดียวกัน 3 เคส (1 ถูกปฏิเสธ→ไม่นับ) เหลือ 2 จาก 6 ออเดอร์ = 0.33 > 0.2 → action
  const d1 = mkOpen('p1');
  const d2 = mkOpen('p2');
  const d3 = reject(mkOpen('p3')) as { ok: true; dispute: Dispute };
  const list = [d1, d2, d3.dispute];
  assert.equal(flagParty(list, 'merchant:khao-man-kai', 6), 'action');
  assert.equal(flagParty(list, 'merchant:khao-man-kai', 100), 'watch'); // อัตราต่ำ แต่ยังมีเคส
  assert.equal(flagParty([], 'merchant:khao-man-kai', 100), 'ok');
});

test('flagCustomer: ใช้จำนวนที่ลูกค้ายื่นทั้งหมด (รวมถูกปฏิเสธ = สัญญาณกันโกง)', () => {
  const list = [mkOpen('c1'), (reject(mkOpen('c2')) as { ok: true; dispute: Dispute }).dispute];
  // 2 จาก 6 ออเดอร์ = 0.33 > เกณฑ์ลูกค้า (0.3) → action
  assert.equal(flagCustomer(list, 'customer:aon', 6), 'action');
  assert.equal(flagCustomer(list, 'customer:nok', 6), 'ok');
});

test('autoActions: การลงโทษสะสมตามระดับ — จับตา→แจ้งเตือน; ดำเนินการ→แจ้งเตือน+ลดอันดับ+ระงับ', () => {
  assert.deepEqual(autoActions('ok'), []);
  assert.deepEqual(autoActions('watch'), ['notify']);
  assert.deepEqual(autoActions('action'), ['notify', 'downrank', 'suspend']);
});

test('planAutoActions: watch→แจ้งเตือนอย่างเดียว; action→ครบทั้งสาม; ข้ามฝ่ายที่ไม่มีเคส', () => {
  const watchDs = [mkOpen('w1', { rider: 'rider:w' })]; // 1 เคส / 3 ออเดอร์ (ตัวอย่างน้อย) = watch
  const actionDs = [mkOpen('a1', { rider: 'rider:a' }), mkOpen('a2', { rider: 'rider:a' }), mkOpen('a3', { rider: 'rider:a' })];
  const parties = [{ account: 'rider:w', orders: 3 }, { account: 'rider:a', orders: 10 }, { account: 'rider:ok', orders: 9 }];
  const plan = planAutoActions([...watchDs, ...actionDs], parties, { notified: [], downranked: [], suspended: [] });
  assert.deepEqual([...plan.notify].sort(), ['rider:a', 'rider:w']); // ทั้ง watch และ action ได้แจ้งเตือน
  assert.deepEqual(plan.downrank, ['rider:a']);
  assert.deepEqual(plan.suspend, ['rider:a']);
});

test('planAutoActions: idempotent — สิ่งที่ทำไปแล้วไม่ทำซ้ำ', () => {
  const ds = [mkOpen('a1', { rider: 'rider:a' }), mkOpen('a2', { rider: 'rider:a' }), mkOpen('a3', { rider: 'rider:a' })];
  const parties = [{ account: 'rider:a', orders: 10 }];
  const plan = planAutoActions(ds, parties, { notified: ['rider:a'], downranked: ['rider:a'], suspended: ['rider:a'] });
  assert.deepEqual(plan.notify, []);
  assert.deepEqual(plan.downrank, []);
  assert.deepEqual(plan.suspend, []);
});
