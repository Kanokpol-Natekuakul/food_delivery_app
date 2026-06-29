/**
 * Catalog — ข้อมูลร้าน + เมนู (reference/seed data ของ V1)
 *
 * อิงศัพท์จาก CONTEXT.md: Merchant, Menu Item, Option, Option Group, Food Price
 * - `choice` = Option Group แบบ "เลือก 1 บังคับ" (ความเผ็ด/ความหวาน/เส้น) ไม่มีราคา
 * - `extras` = Option Group แบบ "เลือกหลายได้" (ท็อปปิ้ง/ของเพิ่ม) ปรับราคา
 *
 * เป็น single source of truth: ฝั่ง web ใช้เป็น reference data, ฝั่ง api ใช้ seed ลง DB
 * ในแอปจริงข้อมูลนี้มาจากฝั่งร้าน (Merchant) — V1 ฮาร์ดโค้ดไว้ก่อน
 * (ฟิลด์ icon/g/rating/blurb/cat/desc เป็น presentation hint ของ V1 ที่ติดมากับ seed)
 */

import type { LatLng } from '../delivery/delivery.js';
import { resolveRates, DEFAULT_RATES } from '../revenue/revenue.js';
import type { Rates, RatePolicy, RateOverride } from '../revenue/revenue.js';

/** ตำแหน่งลูกค้า (V1 ฮาร์ดโค้ดตามที่อยู่บนหน้าแรก: ลาดพร้าว ซ.1) — ปกติมาจากการปักหมุด */
export const CUSTOMER_LOCATION: LatLng = { lat: 13.806, lng: 100.574 };

export type Extra = { id: string; label: string; price: number };

export type Dish = {
  id: string;
  name: string;
  basePrice: number;
  desc: string;
  icon: string;
  /** Option Group เลือก-1 บังคับ (เช่น ความเผ็ด) — ไม่มี = ข้ามกลุ่มนี้ */
  choice?: { label: string; options: string[] };
  /** Option Group เลือกหลายได้ (ท็อปปิ้ง/ของเพิ่ม) */
  extras?: Extra[];
};

export type Restaurant = {
  id: string;
  name: string;
  icon: string;
  /** คลาส gradient พื้นหลังรูป (ดู Home.css/Restaurant.css: .g1..g6) */
  g: string;
  rating: string;
  cat: string;
  blurb: string;
  /** พิกัดร้าน — ใช้คิดระยะส่ง (haversine) จาก CUSTOMER_LOCATION */
  coord: LatLng;
  /** โซนจัดส่ง — ใช้เลือกอัตราส่วนแบ่งค่าส่งตามโซน (ไม่มี = ใช้อัตราตั้งต้น) */
  zone?: string;
  dishes: Dish[];
};

const SPICE = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดกลาง', 'เผ็ดมาก'];
const SWEET = ['หวานปกติ', 'หวานน้อย', 'หวาน 50%', 'ไม่หวาน'];
const NOODLE = ['เส้นเล็ก', 'เส้นใหญ่', 'เส้นหมี่', 'บะหมี่', 'วุ้นเส้น'];

export const restaurants: Restaurant[] = [
  {
    id: 'khao-man-kai',
    name: 'ข้าวมันไก่ตำนาน ลาดพร้าว',
    icon: '🍗', g: 'g1', rating: '★ 4.8', cat: 'ข้าวมันไก่',
    blurb: 'ไก่ต้มเนื้อนุ่ม ข้าวหุงมันหอม น้ำจิ้มเต้าเจี้ยวสูตรร้าน',
    coord: { lat: 13.814, lng: 100.580 },
    dishes: [
      { id: 'kmk-tom', name: 'ข้าวมันไก่ต้ม', basePrice: 50, icon: '🍗',
        desc: 'ไก่ต้มเนื้อนุ่ม ราดน้ำมันไก่ พร้อมน้ำจิ้มเต้าเจี้ยว',
        choice: { label: 'ความเผ็ดน้ำจิ้ม', options: SPICE },
        extras: [
          { id: 'egg', label: 'เพิ่มไข่ต้ม', price: 10 },
          { id: 'rice', label: 'ข้าวเพิ่ม', price: 10 },
          { id: 'chicken', label: 'ไก่พิเศษ', price: 15 },
          { id: 'sauce', label: 'น้ำจิ้มแยกถ้วย', price: 5 },
        ] },
      { id: 'kmk-tod', name: 'ข้าวมันไก่ทอด', basePrice: 55, icon: '🍗',
        desc: 'ไก่ทอดกรอบนอกนุ่มใน เสิร์ฟบนข้าวมัน',
        choice: { label: 'ความเผ็ดน้ำจิ้ม', options: SPICE },
        extras: [
          { id: 'egg', label: 'เพิ่มไข่ต้ม', price: 10 },
          { id: 'rice', label: 'ข้าวเพิ่ม', price: 10 },
          { id: 'chicken', label: 'ไก่พิเศษ', price: 15 },
        ] },
      { id: 'kmk-mix', name: 'ข้าวมันไก่รวมมิตร (ต้ม+ทอด)', basePrice: 70, icon: '🍱',
        desc: 'ได้ทั้งไก่ต้มและไก่ทอดในจานเดียว จัดเต็ม',
        extras: [
          { id: 'egg', label: 'เพิ่มไข่ต้ม', price: 10 },
          { id: 'rice', label: 'ข้าวเพิ่ม', price: 10 },
        ] },
      { id: 'kmk-soup', name: 'น้ำซุปเพิ่ม', basePrice: 10, icon: '🥣',
        desc: 'น้ำซุปกระดูกไก่ใส่ฟักเพิ่มหนึ่งถ้วย' },
    ],
  },
  {
    id: 'kuaytiao-ruea',
    name: 'ก๋วยเตี๋ยวเรือป้านิด',
    icon: '🍜', g: 'g2', rating: '★ 4.7', cat: 'ก๋วยเตี๋ยว',
    blurb: 'น้ำตกเข้มข้น เครื่องแน่น สูตรเรือต้นตำรับ',
    coord: { lat: 13.792, lng: 100.560 },
    dishes: [
      { id: 'kr-moo', name: 'ก๋วยเตี๋ยวเรือหมู', basePrice: 45, icon: '🍜',
        desc: 'น้ำตกหมูเข้มข้น ลูกชิ้นเด้ง ผักสด',
        choice: { label: 'เลือกเส้น', options: NOODLE },
        extras: [
          { id: 'luuk', label: 'เพิ่มลูกชิ้น', price: 15 },
          { id: 'moo', label: 'หมูเพิ่ม', price: 15 },
          { id: 'pak', label: 'ผักเพิ่ม', price: 5 },
          { id: 'kaki', label: 'แคบหมู', price: 10 },
        ] },
      { id: 'kr-nuea', name: 'ก๋วยเตี๋ยวเรือเนื้อ', basePrice: 55, icon: '🍜',
        desc: 'เนื้อเปื่อยนุ่ม น้ำซุปหอมเครื่องเทศ',
        choice: { label: 'เลือกเส้น', options: NOODLE },
        extras: [
          { id: 'nuea', label: 'เนื้อเพิ่ม', price: 20 },
          { id: 'luuk', label: 'เพิ่มลูกชิ้นเนื้อ', price: 15 },
          { id: 'kaki', label: 'แคบหมู', price: 10 },
        ] },
      { id: 'kr-yen', name: 'เกาเหลา (ไม่ใส่เส้น)', basePrice: 50, icon: '🥣',
        desc: 'เครื่องจัดเต็มไม่มีเส้น สำหรับคนคุมแป้ง',
        extras: [
          { id: 'luuk', label: 'เพิ่มลูกชิ้น', price: 15 },
          { id: 'moo', label: 'หมูเพิ่ม', price: 15 },
        ] },
      { id: 'kr-kaki', name: 'แคบหมูถ้วย', basePrice: 20, icon: '🍘',
        desc: 'แคบหมูกรอบ ๆ ทานเล่นหรือโรยในชาม' },
    ],
  },
  {
    id: 'cha-maimuk',
    name: 'ชาไข่มุกซอย 5',
    icon: '🧋', g: 'g4', rating: '★ 4.9', cat: 'เครื่องดื่ม',
    blurb: 'ชงสด ไข่มุกนุ่มหนึบ หวานปรับได้ตามใจ',
    coord: { lat: 13.809, lng: 100.578 },
    dishes: [
      { id: 'cm-thai', name: 'ชาไทยไข่มุก', basePrice: 45, icon: '🧋',
        desc: 'ชาไทยเข้มข้น นมหอม ไข่มุกหนึบ',
        choice: { label: 'ระดับความหวาน', options: SWEET },
        extras: [
          { id: 'boba', label: 'เพิ่มไข่มุก', price: 10 },
          { id: 'konjac', label: 'เพิ่มบุก', price: 10 },
          { id: 'whip', label: 'วิปครีม', price: 15 },
          { id: 'shot', label: 'เพิ่มชอตชา', price: 20 },
        ] },
      { id: 'cm-green', name: 'ชาเขียวนมไข่มุก', basePrice: 45, icon: '🍵',
        desc: 'ชาเขียวมัทฉะ นมสด ไข่มุก',
        choice: { label: 'ระดับความหวาน', options: SWEET },
        extras: [
          { id: 'boba', label: 'เพิ่มไข่มุก', price: 10 },
          { id: 'whip', label: 'วิปครีม', price: 15 },
        ] },
      { id: 'cm-choc', name: 'โกโก้ปั่น', basePrice: 55, icon: '🥤',
        desc: 'โกโก้เข้ม ๆ ปั่นเย็นซ่า',
        choice: { label: 'ระดับความหวาน', options: SWEET },
        extras: [{ id: 'whip', label: 'วิปครีม', price: 15 }] },
      { id: 'cm-lemon', name: 'ชามะนาว', basePrice: 40, icon: '🍋',
        desc: 'ชาดำมะนาว สดชื่นเปรี้ยวหวาน',
        choice: { label: 'ระดับความหวาน', options: SWEET } },
    ],
  },
  {
    id: 'somtam',
    name: 'ส้มตำแซ่บนัว',
    icon: '🥗', g: 'g3', rating: '★ 4.6', cat: 'อีสาน',
    blurb: 'ตำสด ครกต่อครก รสจัดจ้านแบบอีสานแท้',
    coord: { lat: 13.788, lng: 100.590 },
    dishes: [
      { id: 'st-thai', name: 'ตำไทย', basePrice: 40, icon: '🥗',
        desc: 'ส้มตำไทยใส่ถั่วกุ้งแห้ง รสกลมกล่อม',
        choice: { label: 'ความเผ็ด', options: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดกลาง', 'เผ็ดมาก', 'เผ็ดสุด'] },
        extras: [
          { id: 'kaikem', label: 'ไข่เค็ม', price: 10 },
          { id: 'poo', label: 'ปูม้า', price: 20 },
          { id: 'koong', label: 'กุ้งสดพิเศษ', price: 15 },
        ] },
      { id: 'st-poo', name: 'ตำปูปลาร้า', basePrice: 50, icon: '🦀',
        desc: 'ปูเค็มปลาร้านัว ๆ สายแซ่บห้ามพลาด',
        choice: { label: 'ความเผ็ด', options: ['เผ็ดน้อย', 'เผ็ดกลาง', 'เผ็ดมาก', 'เผ็ดสุด'] },
        extras: [{ id: 'kaikem', label: 'ไข่เค็ม', price: 10 }] },
      { id: 'st-kor', name: 'ไก่ย่าง (ครึ่งตัว)', basePrice: 90, icon: '🍗',
        desc: 'ไก่ย่างหมักสมุนไพร หอมเครื่อง',
        extras: [{ id: 'sticky', label: 'ข้าวเหนียวเพิ่ม', price: 10 }] },
      { id: 'st-sticky', name: 'ข้าวเหนียว', basePrice: 10, icon: '🍚',
        desc: 'ข้าวเหนียวนึ่งร้อน ๆ หนึ่งกระติบเล็ก' },
    ],
  },
  {
    id: 'moo-ping',
    name: 'หมูปิ้งเจ๊แดง',
    icon: '🍢', g: 'g5', rating: '★ 4.7', cat: 'อีสาน',
    blurb: 'หมักนุ่มหวานหอม ปิ้งสดเตาถ่านทุกไม้',
    coord: { lat: 13.818, lng: 100.566 },
    dishes: [
      { id: 'mp-stick', name: 'หมูปิ้ง (ไม้)', basePrice: 12, icon: '🍢',
        desc: 'หมูหมักสูตรเด็ด ปิ้งเตาถ่านหอม ๆ',
        extras: [{ id: 'sticky', label: 'ข้าวเหนียว', price: 10 }] },
      { id: 'mp-set', name: 'หมูปิ้ง 5 ไม้ + ข้าวเหนียว', basePrice: 65, icon: '🍱',
        desc: 'เซ็ตอิ่มกำลังดี หมูปิ้ง 5 ไม้พร้อมข้าวเหนียว' },
      { id: 'mp-kai', name: 'ไก่ปิ้ง (ไม้)', basePrice: 12, icon: '🍢',
        desc: 'ไก่หมักนุ่ม ปิ้งหอมเตาถ่าน' },
      { id: 'mp-jaew', name: 'น้ำจิ้มแจ่ว', basePrice: 5, icon: '🌶️',
        desc: 'แจ่วรสแซ่บ จิ้มคู่หมูปิ้ง' },
    ],
  },
  {
    id: 'tom-lueat-moo',
    name: 'ต้มเลือดหมูเฮียชาญ',
    icon: '🍲', g: 'g6', rating: '★ 4.5', cat: 'ก๋วยเตี๋ยว',
    blurb: 'น้ำซุปกระดูกเคี่ยวนาน เครื่องในสด ใส่ไม่อั้น',
    coord: { lat: 13.800, lng: 100.555 },
    dishes: [
      { id: 'tlm-classic', name: 'ต้มเลือดหมู', basePrice: 50, icon: '🍲',
        desc: 'เลือดหมูนุ่ม เครื่องในรวม น้ำซุปกลมกล่อม',
        extras: [
          { id: 'set', label: 'เครื่องในเพิ่ม', price: 20 },
          { id: 'kai', label: 'ไข่ลวก', price: 10 },
          { id: 'kaki', label: 'แคบหมู', price: 10 },
        ] },
      { id: 'tlm-special', name: 'ต้มเลือดหมูพิเศษ', basePrice: 70, icon: '🍲',
        desc: 'จัดเต็มทุกเครื่อง สำหรับสายเครื่องในตัวจริง',
        extras: [{ id: 'kai', label: 'ไข่ลวก', price: 10 }] },
      { id: 'tlm-rice', name: 'ข้าวสวย', basePrice: 10, icon: '🍚',
        desc: 'ข้าวสวยร้อน ๆ หนึ่งจาน' },
    ],
  },
  {
    // ร้านไกล — อยู่นอก Service Zone (>6 กม.) เพื่อให้เห็นการบล็อกสั่งจริง
    id: 'khao-tom-rung',
    name: 'ข้าวต้มโต้รุ่งเฮียอ้วน',
    icon: '🍚', g: 'g2', rating: '★ 4.6', cat: 'ตามสั่ง',
    blurb: 'ร้านโต้รุ่งเปิดดึก ผัดเร็วทันใจ รสจัดถึงเครื่อง',
    coord: { lat: 13.880, lng: 100.640 },
    zone: 'outer', // นอกเขตชั้นใน — อัตราส่วนแบ่งค่าส่งต่างจากโซนปกติ
    dishes: [
      { id: 'ktr-pad', name: 'ข้าวผัดกระเพราหมูสับไข่ดาว', basePrice: 60, icon: '🍳',
        desc: 'กระเพราหมูสับรสจัด ไข่ดาวกรอบ ๆ',
        choice: { label: 'ความเผ็ด', options: SPICE },
        extras: [{ id: 'egg', label: 'ไข่ดาวเพิ่ม', price: 10 }] },
      { id: 'ktr-tom', name: 'ข้าวต้มหมูสับ', basePrice: 50, icon: '🍚',
        desc: 'ข้าวต้มร้อน ๆ หมูสับเด้ง ขิงซอย',
        extras: [{ id: 'kai', label: 'ไข่ลวก', price: 10 }] },
    ],
  },
];

// ค้นจาก "ลิสต์ร้านที่ส่งเข้ามา" (ปกติคือ state.restaurants ใน store) — ไม่อ้าง static array
// เพื่อให้การแก้เมนูฝั่งร้านสะท้อนทุกหน้า; `restaurants` ด้านบนเป็นแค่ seed เริ่มต้น
export const findRestaurant = (
  list: readonly Restaurant[],
  id: string | undefined,
): Restaurant | undefined => list.find((r) => r.id === id);

export const findDish = (
  list: readonly Restaurant[],
  restaurantId: string | undefined,
  dishId: string | undefined,
): { restaurant: Restaurant; dish: Dish } | undefined => {
  const restaurant = findRestaurant(list, restaurantId);
  const dish = restaurant?.dishes.find((d) => d.id === dishId);
  return restaurant && dish ? { restaurant, dish } : undefined;
};

/**
 * นโยบายอัตราคอมมิชชัน/ส่วนแบ่งค่าส่ง (ADR 0003 — V1 ฮาร์ดโค้ด, จริงมาจากสัญญาแต่ละร้าน/โซน)
 * base 30%/20%; โซนไกล (outer) แพลตฟอร์มแบ่งค่าส่งน้อยลงเพื่อจูงใจไรเดอร์;
 * ร้านเครื่องดื่ม (มาร์จิ้นสูง) เจรจาคอมต่ำกว่า
 */
export const RATE_POLICY: RatePolicy = {
  base: DEFAULT_RATES,
  byZone: { outer: { deliveryShareRate: 0.1 } },
  byMerchant: { 'cha-maimuk': { commissionRate: 0.2 } },
};

/**
 * อัตราที่ใช้จริงของร้านหนึ่ง (รวม override ต่อร้าน/โซน) — ไม่มีร้าน = อัตราตั้งต้น
 * `byMerchant` ส่งเข้าได้เพื่อใช้อัตราที่เจรจาแล้วจาก store (ดีฟอลต์ = นโยบาย seed)
 */
export const ratesFor = (
  r: Pick<Restaurant, 'id' | 'zone'> | undefined,
  byMerchant: Readonly<Record<string, RateOverride>> = RATE_POLICY.byMerchant ?? {},
): Rates =>
  r ? resolveRates({ ...RATE_POLICY, byMerchant }, r.id, r.zone) : DEFAULT_RATES;

/** แปลงแผนที่ override คอม (ร้าน→อัตรา) เป็นรูปแบบ byMerchant ของ RatePolicy */
export const merchantOverrides = (
  overrides: Readonly<Record<string, number>>,
): Record<string, RateOverride> =>
  Object.fromEntries(Object.entries(overrides).map(([id, commissionRate]) => [id, { commissionRate }]));
