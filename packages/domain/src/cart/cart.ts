/**
 * โดเมนตะกร้า (Cart) — pure, ไม่พึ่ง UI
 * อิงศัพท์จาก CONTEXT.md: Cart, Order Line, Option, Food Price
 * และโมเดลเงินจาก ADR 0003 (ค่าอาหาร + ค่าส่ง + ค่าบริการ)
 */

export type SelectedOption = { label: string; price: number };

/** หนึ่งบรรทัดในตะกร้า/ออเดอร์ = รายการเมนู + ตัวเลือก + จำนวน */
export type OrderLine = {
  id: string;
  itemName: string;
  basePrice: number;
  spice: string;               // ตัวเลือกเลือก-1 (ไม่มีราคา) เก็บไว้แสดง
  options: SelectedOption[];   // ตัวเลือกเพิ่มเติม (เลือกหลายได้)
  qty: number;
  note: string;
};

export type Cart = { lines: OrderLine[] };

export const emptyCart = (): Cart => ({ lines: [] });
export const isEmpty = (c: Cart): boolean => c.lines.length === 0;

export const lineUnitPrice = (l: OrderLine): number =>
  l.basePrice + l.options.reduce((s, o) => s + o.price, 0);
export const lineTotal = (l: OrderLine): number => lineUnitPrice(l) * l.qty;

export const cartItemCount = (c: Cart): number => c.lines.reduce((s, l) => s + l.qty, 0);
export const foodTotal = (c: Cart): number => c.lines.reduce((s, l) => s + lineTotal(l), 0);

export const addLine = (c: Cart, line: OrderLine): Cart => ({ lines: [...c.lines, line] });

/**
 * ผลของการพยายามเพิ่มรายการลงตะกร้า โดยเคารพกฎ "1 ออเดอร์ = 1 ร้าน" (CONTEXT: Order)
 * - `added`  → เพิ่มได้ คืนตะกร้าใหม่
 * - `switch` → รายการมาจากคนละร้านกับตะกร้าที่มีของอยู่ ผู้เรียก (UI) ต้องถามยืนยันก่อนเริ่มตะกร้าใหม่
 */
export type AddLineResult =
  | { readonly status: 'added'; readonly cart: Cart }
  | { readonly status: 'switch'; readonly from: string; readonly to: string };

export function tryAddLine(
  cart: Cart,
  currentRestaurantId: string | null,
  restaurantId: string,
  line: OrderLine,
): AddLineResult {
  if (cart.lines.length > 0 && currentRestaurantId !== null && currentRestaurantId !== restaurantId) {
    return { status: 'switch', from: currentRestaurantId, to: restaurantId };
  }
  return { status: 'added', cart: addLine(cart, line) };
}
export const removeLine = (c: Cart, id: string): Cart =>
  ({ lines: c.lines.filter((l) => l.id !== id) });
export const setLineQty = (c: Cart, id: string, qty: number): Cart =>
  ({ lines: c.lines.map((l) => (l.id === id ? { ...l, qty: Math.max(1, qty) } : l)) });

// ── ราคา (ADR 0003) — ค่าบริการคงที่; ค่าส่งคิดจากระยะทาง (ADR 0005, ดู domain/delivery) ──
export const DELIVERY_FEE = 20; // fallback เมื่อยังไม่รู้ระยะทาง
export const SERVICE_FEE = 9;

export type Breakdown = { food: number; delivery: number; service: number; total: number };

/**
 * สรุปยอด = ค่าอาหาร + ค่าส่ง + ค่าบริการ
 * `deliveryOverride` = ค่าส่งที่ผู้เรียกคำนวณจากระยะทาง (deliveryFee). ไม่ส่ง = ใช้ค่า fallback คงที่
 */
export const priceBreakdown = (c: Cart, deliveryOverride?: number): Breakdown => {
  const food = foodTotal(c);
  const empty = isEmpty(c);
  const delivery = empty ? 0 : (deliveryOverride ?? DELIVERY_FEE);
  const service = empty ? 0 : SERVICE_FEE;
  return { food, delivery, service, total: food + delivery + service };
};
