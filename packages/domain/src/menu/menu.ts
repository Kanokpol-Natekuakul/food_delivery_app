/**
 * จัดการเมนู (Menu CRUD) — ตรรกะบริสุทธิ์สำหรับฝั่งร้านแก้รายการอาหาร
 *
 * ทำงานบนลิสต์ของ "รายการที่มี id + ชื่อ + ราคา + คำอธิบาย" แบบ generic
 * (UI ใช้ type Dish ที่มีฟิลด์เพิ่ม เช่น icon/extras — ฟังก์ชันพวกนี้ไม่แตะ)
 * ทุกฟังก์ชันคืน Result ไม่ throw และไม่กลายพันธุ์ลิสต์เดิม
 */

export type ItemBase = { readonly id: string; readonly name: string; readonly basePrice: number; readonly desc: string };

export type ItemFields = { readonly name: string; readonly basePrice: number; readonly desc: string };

export type MenuResult<T> =
  | { readonly ok: true; readonly items: readonly T[] }
  | { readonly ok: false; readonly reason: string };

/** ตรวจฟิลด์ที่แก้ได้ของเมนู — คืนข้อความ error หรือ null ถ้าผ่าน */
export function validateItemFields(f: { name: string; basePrice: number }): string | null {
  if (f.name.trim().length === 0) return 'ต้องมีชื่อเมนู';
  if (!Number.isFinite(f.basePrice) || f.basePrice < 0) return 'ราคาต้องเป็นจำนวนไม่ติดลบ';
  if (!Number.isInteger(f.basePrice)) return 'ราคาต้องเป็นจำนวนเต็ม (บาท)';
  return null;
}

/** เพิ่มเมนูใหม่ต่อท้าย (id ต้องไม่ซ้ำ ฟิลด์ต้องผ่าน) */
export function addItem<T extends ItemBase>(items: readonly T[], item: T): MenuResult<T> {
  const bad = validateItemFields(item);
  if (bad) return { ok: false, reason: bad };
  if (items.some((i) => i.id === item.id)) return { ok: false, reason: 'มีเมนูรหัสนี้แล้ว' };
  return { ok: true, items: [...items, item] };
}

/** แก้ฟิลด์ของเมนูตาม id (ฟิลด์ใหม่ต้องผ่าน) */
export function updateItem<T extends ItemBase>(items: readonly T[], id: string, fields: ItemFields): MenuResult<T> {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false, reason: 'ไม่พบเมนูที่จะแก้' };
  const bad = validateItemFields(fields);
  if (bad) return { ok: false, reason: bad };
  const copy = items.slice();
  copy[idx] = { ...items[idx]!, ...fields };
  return { ok: true, items: copy };
}

/** ลบเมนูตาม id */
export function removeItem<T extends ItemBase>(items: readonly T[], id: string): MenuResult<T> {
  if (!items.some((i) => i.id === id)) return { ok: false, reason: 'ไม่พบเมนูที่จะลบ' };
  return { ok: true, items: items.filter((i) => i.id !== id) };
}
