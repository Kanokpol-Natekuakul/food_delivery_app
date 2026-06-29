/**
 * Catalog (ฝั่ง web) — re-export จาก single source ใน @app/domain/catalog
 *
 * ข้อมูลร้าน+เมนู ย้ายไปอยู่ที่ packages/domain/src/catalog/catalog.ts เพื่อให้
 * ทั้ง web (reference data) และ apps/api (seed ลง DB) ใช้ชุดเดียวกัน
 * ไฟล์นี้คงไว้เป็น shim เพื่อให้ path import เดิม (`../data/catalog`) ของหน้า UI ไม่ต้องแก้
 */
export type { Extra, Dish, Restaurant } from '@app/domain/catalog/catalog.js';
export {
  CUSTOMER_LOCATION,
  restaurants,
  findRestaurant,
  findDish,
  RATE_POLICY,
  ratesFor,
  merchantOverrides,
} from '@app/domain/catalog/catalog.js';
