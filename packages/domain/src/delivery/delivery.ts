/**
 * โดเมนจัดส่ง (Delivery) — ระยะทาง + ค่าส่ง + ขอบเขตบริการ
 *
 * อิง CONTEXT.md + ADR 0005 (ไม่ใช้แผนที่ภายนอกใน V1):
 * - Delivery Distance = ระยะ "เส้นตรง" (haversine) ระหว่างพิกัดร้านกับลูกค้า (ไม่ใช่ระยะถนนจริง)
 * - Delivery Fee = แพลตฟอร์มกำหนดจากระยะทาง
 * - Service Zone = รัศมีสูงสุดรอบร้านที่ยังให้บริการ ไกลเกิน = สั่งไม่ได้
 */

export type LatLng = { readonly lat: number; readonly lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** ระยะเส้นตรง (haversine) ระหว่าง 2 พิกัด หน่วยกิโลเมตร */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ── ค่าส่ง: ฿15 พื้นฐาน + ฿7/กม. (ขั้นต่ำ = ฿15) ──
export const DELIVERY_BASE = 15;
export const DELIVERY_PER_KM = 7;

/** ค่าส่งจากระยะทาง (กม.) — ปัดเป็นบาท ขั้นต่ำเท่าค่าพื้นฐาน */
export function deliveryFee(distanceKm: number): number {
  const km = Math.max(0, distanceKm);
  return Math.max(DELIVERY_BASE, DELIVERY_BASE + Math.round(km * DELIVERY_PER_KM));
}

// ── ขอบเขตบริการ: รัศมีสูงสุดรอบร้านที่ยังให้บริการ (เกิน = สั่งไม่ได้) ──
export const SERVICE_ZONE_KM = 6;

/** ระยะนี้ยังอยู่ในขอบเขตบริการไหม (เกินรัศมี = นอกพื้นที่) */
export function isWithinServiceZone(distanceKm: number, maxKm: number = SERVICE_ZONE_KM): boolean {
  return distanceKm <= maxKm;
}

/**
 * คำตัดสินรวมว่าสั่งจากร้านนี้ได้ไหม — UI เรียกครั้งเดียวด้วยพิกัดลูกค้า+ร้าน
 * แล้วได้ทั้ง "สั่งได้ + ระยะ + ค่าส่ง" หรือ "นอกเขต + เหตุผล + ระยะ" กลับมา
 */
export type Serviceability =
  | { readonly orderable: true; readonly distanceKm: number; readonly fee: number }
  | { readonly orderable: false; readonly distanceKm: number; readonly reason: 'out_of_zone' };

export function checkServiceability(
  customer: LatLng,
  restaurant: LatLng,
  maxKm: number = SERVICE_ZONE_KM,
): Serviceability {
  const distanceKm = haversineKm(customer, restaurant);
  if (!isWithinServiceZone(distanceKm, maxKm)) {
    return { orderable: false, distanceKm, reason: 'out_of_zone' };
  }
  return { orderable: true, distanceKm, fee: deliveryFee(distanceKm) };
}
