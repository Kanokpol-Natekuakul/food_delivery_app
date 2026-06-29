import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCart, addLine, removeLine, setLineQty,
  lineTotal, foodTotal, cartItemCount, priceBreakdown, tryAddLine,
} from './cart.js';
import type { OrderLine } from './cart.js';

const line = (over: Partial<OrderLine> = {}): OrderLine => ({
  id: '1', itemName: 'ข้าวมันไก่', basePrice: 50, spice: 'เผ็ดน้อย',
  options: [{ label: 'ไข่', price: 10 }], qty: 2, note: '', ...over,
});

test('lineTotal = (ราคาตั้งต้น + ตัวเลือก) × จำนวน', () => {
  assert.equal(lineTotal(line()), (50 + 10) * 2);
});

test('add / นับจำนวน / รวมค่าอาหาร', () => {
  let c = emptyCart();
  c = addLine(c, line({ id: 'a', qty: 1, options: [] }));
  c = addLine(c, line({ id: 'b', qty: 3, options: [{ label: 'พิเศษ', price: 15 }] }));
  assert.equal(cartItemCount(c), 4);
  assert.equal(foodTotal(c), 50 * 1 + (50 + 15) * 3);
});

test('setLineQty ขั้นต่ำ 1 และ removeLine', () => {
  let c = addLine(emptyCart(), line({ id: 'x' }));
  c = setLineQty(c, 'x', 0);
  assert.equal(c.lines[0]!.qty, 1);
  c = removeLine(c, 'x');
  assert.equal(c.lines.length, 0);
});

test('priceBreakdown รวมค่าส่ง+ค่าบริการเมื่อมีของ, ว่าง=0', () => {
  assert.equal(priceBreakdown(emptyCart()).total, 0);
  const b = priceBreakdown(addLine(emptyCart(), line({ options: [], qty: 1 })));
  assert.equal(b.food, 50);
  assert.ok(b.delivery > 0 && b.service > 0);
  assert.equal(b.total, b.food + b.delivery + b.service);
});

// ── tryAddLine: invariant "1 ออเดอร์ = 1 ร้าน" (CONTEXT: Order) ──

test('tryAddLine: เพิ่มลงตะกร้าว่าง → added พร้อมรายการ', () => {
  const r = tryAddLine(emptyCart(), null, 'shop-a', line({ id: 'a' }));
  assert.equal(r.status, 'added');
  assert.ok(r.status === 'added' && r.cart.lines.length === 1);
});

test('tryAddLine: ร้านใหม่ขณะตะกร้าไม่ว่าง → switch (ไม่แตะตะกร้าเดิม)', () => {
  const existing = addLine(emptyCart(), line({ id: 'a' }));
  const r = tryAddLine(existing, 'shop-a', 'shop-b', line({ id: 'b' }));
  assert.deepEqual(r, { status: 'switch', from: 'shop-a', to: 'shop-b' });
  assert.equal(existing.lines.length, 1); // ของเดิมยังอยู่
});

test('tryAddLine: ร้านเดิม → added ต่อท้าย (ไม่ switch)', () => {
  const existing = addLine(emptyCart(), line({ id: 'a' }));
  const r = tryAddLine(existing, 'shop-a', 'shop-a', line({ id: 'b' }));
  assert.equal(r.status, 'added');
  assert.ok(r.status === 'added' && r.cart.lines.length === 2);
});
