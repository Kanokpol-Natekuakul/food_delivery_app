import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItemFields, addItem, updateItem, removeItem } from './menu.js';

type Item = { id: string; name: string; basePrice: number; desc: string };
const base: Item[] = [
  { id: 'a', name: 'ข้าวมันไก่', basePrice: 50, desc: 'นุ่ม' },
  { id: 'b', name: 'ชาไทย', basePrice: 45, desc: 'หอม' },
];

test('validateItemFields: ชื่อว่าง/ราคาติดลบ/ไม่เป็นจำนวนเต็ม = error, ถูกต้อง = null', () => {
  assert.equal(validateItemFields({ name: '  ', basePrice: 10 }), 'ต้องมีชื่อเมนู');
  assert.equal(validateItemFields({ name: 'x', basePrice: -1 }), 'ราคาต้องเป็นจำนวนไม่ติดลบ');
  assert.equal(validateItemFields({ name: 'x', basePrice: 10.5 }), 'ราคาต้องเป็นจำนวนเต็ม (บาท)');
  assert.equal(validateItemFields({ name: 'x', basePrice: 0 }), null);
});

test('addItem: เพิ่มเมนูถูกต้อง → ต่อท้ายลิสต์', () => {
  const res = addItem(base, { id: 'c', name: 'หมูปิ้ง', basePrice: 12, desc: 'ไม้ละ' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.items.length, 3);
    assert.equal(res.items[2]?.id, 'c');
    assert.equal(base.length, 2); // ไม่กลายพันธุ์ของเดิม
  }
});

test('addItem: id ซ้ำ → error', () => {
  const res = addItem(base, { id: 'a', name: 'อะไรก็ตาม', basePrice: 10, desc: '' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /รหัสนี้แล้ว/);
});

test('addItem: ฟิลด์ไม่ผ่าน → error (ไม่เพิ่ม)', () => {
  const res = addItem(base, { id: 'c', name: '', basePrice: 10, desc: '' });
  assert.equal(res.ok, false);
});

test('updateItem: แก้ชื่อ+ราคา', () => {
  const res = updateItem(base, 'a', { name: 'ข้าวมันไก่ทอด', basePrice: 55, desc: 'กรอบ' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.items[0]?.name, 'ข้าวมันไก่ทอด');
    assert.equal(res.items[0]?.basePrice, 55);
    assert.equal(base[0]?.name, 'ข้าวมันไก่'); // ของเดิมไม่เปลี่ยน
  }
});

test('updateItem: ไม่พบ id → error, ฟิลด์ไม่ผ่าน → error', () => {
  assert.equal(updateItem(base, 'zzz', { name: 'x', basePrice: 1, desc: '' }).ok, false);
  assert.equal(updateItem(base, 'a', { name: 'x', basePrice: -5, desc: '' }).ok, false);
});

test('removeItem: ลบเมนูที่มี / ไม่พบ → error', () => {
  const res = removeItem(base, 'b');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.items.map((i) => i.id), ['a']);
  }
  assert.equal(removeItem(base, 'zzz').ok, false);
});
