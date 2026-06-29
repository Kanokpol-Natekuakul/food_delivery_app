/**
 * กำกับดูแลผู้ใช้ (Moderation) — ชุดรายชื่อที่ถูกพักงาน/ระงับ
 *
 * ใช้กับ Rider Suspension (ADR 0002: ไรเดอร์คว้าแล้วทิ้งบ่อย → พักงาน) และร้านที่โดนระงับ
 * เก็บเป็นชุด id แบบ string (เช่น 'rider:somchai', 'merchant:khao-man-kai') ทุกฟังก์ชันบริสุทธิ์
 */

/** ระงับผู้ใช้ (ซ้ำ = ไม่เพิ่ม) */
export function suspend(list: readonly string[], actor: string): readonly string[] {
  return list.includes(actor) ? list : [...list, actor];
}

/** ปลดระงับ */
export function unsuspend(list: readonly string[], actor: string): readonly string[] {
  return list.filter((a) => a !== actor);
}

/** ผู้ใช้นี้ถูกระงับอยู่ไหม */
export function isSuspended(list: readonly string[], actor: string): boolean {
  return list.includes(actor);
}

/**
 * จัดอันดับรายการตาม "สถานะกำกับดูแล" (ADR 0006: ลดอันดับ) — ฝ่ายที่ถูกลดอันดับไปอยู่ท้าย
 * คงลำดับเดิมภายในแต่ละกลุ่ม (stable: partition ไม่ใช่ sort) และไม่กลายพันธุ์ของเดิม
 */
export function rankByStanding<T>(
  items: readonly T[],
  key: (item: T) => string,
  downranked: readonly string[],
): T[] {
  const ok: T[] = [];
  const down: T[] = [];
  for (const item of items) (downranked.includes(key(item)) ? down : ok).push(item);
  return [...ok, ...down];
}
