/**
 * Catalog service — อ่าน/seed ร้าน+เมนู
 * คืนรูป nested `Restaurant[]` ตรงชนิด @app/domain/catalog เพื่อให้ฝั่ง web
 * สลับจาก hardcode `restaurants` มาเป็น GET /restaurants ได้โดยไม่แก้ชนิด
 */
import { eq } from 'drizzle-orm';
import { restaurants as seedRestaurants } from '@app/domain/catalog/catalog.js';
import type { Restaurant, Dish } from '@app/domain/catalog/catalog.js';
import type { MenuResult } from '@app/domain/menu/menu.js';
import { db, schema } from '../db/index.js';
import type { Db } from '../db/index.js';

type RestaurantRow = typeof schema.restaurants.$inferSelect;
type MenuItemRow = typeof schema.menuItems.$inferSelect;

/** ประกอบแถว menu_items → Dish (ใส่ choice/extras เฉพาะเมื่อมีค่า ให้ตรง exactOptionalPropertyTypes) */
function toDish(row: MenuItemRow): Dish {
  const dish: Dish = { id: row.dishId, name: row.name, basePrice: row.basePrice, desc: row.description, icon: row.icon };
  if (row.choice) return { ...dish, choice: row.choice, ...(row.extras ? { extras: row.extras } : {}) };
  return row.extras ? { ...dish, extras: row.extras } : dish;
}

/** ประกอบแถว restaurants + เมนูที่จับคู่ → Restaurant (ใส่ zone เฉพาะเมื่อมีค่า) */
function toRestaurant(row: RestaurantRow, dishes: Dish[]): Restaurant {
  const base = {
    id: row.id, name: row.name, icon: row.icon, g: row.g, rating: row.rating,
    cat: row.cat, blurb: row.blurb, coord: { lat: row.lat, lng: row.lng }, dishes,
  };
  return row.zone ? { ...base, zone: row.zone } : base;
}

/** โหลดร้านทั้งหมดเป็นรูป nested (พร้อมเมนู) — เรียงตามลำดับ seed เดิม */
export async function loadRestaurants(conn: Db = db): Promise<Restaurant[]> {
  const [rRows, mRows] = await Promise.all([
    conn.select().from(schema.restaurants),
    conn.select().from(schema.menuItems),
  ]);
  const byRestaurant = new Map<string, Dish[]>();
  for (const m of mRows) {
    const list = byRestaurant.get(m.restaurantId) ?? [];
    list.push(toDish(m));
    byRestaurant.set(m.restaurantId, list);
  }
  const order = new Map(seedRestaurants.map((r, i) => [r.id, i]));
  return rRows
    .map((r) => toRestaurant(r, byRestaurant.get(r.id) ?? []))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** โหลดร้านเดียว (พร้อมเมนู) — ไม่พบ = undefined */
export async function loadRestaurant(id: string, conn: Db = db): Promise<Restaurant | undefined> {
  const [r] = await conn.select().from(schema.restaurants).where(eq(schema.restaurants.id, id));
  if (!r) return undefined;
  const mRows = await conn.select().from(schema.menuItems).where(eq(schema.menuItems.restaurantId, id));
  return toRestaurant(r, mRows.map(toDish));
}

/** Seed ร้าน+เมนูจาก catalog ของ domain (idempotent: ล้างก่อนใส่ใหม่) */
export async function seedCatalog(conn: Db = db): Promise<{ restaurants: number; dishes: number }> {
  return conn.transaction(async (tx) => {
    await tx.delete(schema.menuItems);
    await tx.delete(schema.restaurants);
    let dishes = 0;
    for (const r of seedRestaurants) {
      await tx.insert(schema.restaurants).values({
        id: r.id, name: r.name, icon: r.icon, g: r.g, rating: r.rating, cat: r.cat,
        blurb: r.blurb, lat: r.coord.lat, lng: r.coord.lng, zone: r.zone ?? null,
      });
      for (const d of r.dishes) {
        await tx.insert(schema.menuItems).values({
          id: `${r.id}:${d.id}`, dishId: d.id, restaurantId: r.id, name: d.name, basePrice: d.basePrice,
          description: d.desc, icon: d.icon, choice: d.choice ?? null, extras: d.extras ?? null,
        });
        dishes++;
      }
    }
    return { restaurants: seedRestaurants.length, dishes };
  });
}

/**
 * ใช้การแก้เมนู (เพิ่ม/แก้/ลบ) ผ่านฟังก์ชันโดเมน menu — load dishes → fn → ถ้า ok เขียนทับเมนูของร้าน
 * อะตอมมิกใน transaction; คืน code (404 ไม่พบร้าน / 409 โดเมนปฏิเสธ) เพื่อให้ route ตอบสถานะถูก
 */
export async function applyMenu(
  restaurantId: string,
  fn: (dishes: Dish[]) => MenuResult<Dish>,
): Promise<{ ok: true; dishes: Dish[] } | { ok: false; code: number; reason: string }> {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.restaurants).where(eq(schema.restaurants.id, restaurantId));
    if (!r) return { ok: false, code: 404, reason: 'ไม่พบร้าน' };

    const rows = await tx.select().from(schema.menuItems).where(eq(schema.menuItems.restaurantId, restaurantId));
    const res = fn(rows.map(toDish));
    if (!res.ok) return { ok: false, code: 409, reason: res.reason };

    const dishes = [...res.items];
    await tx.delete(schema.menuItems).where(eq(schema.menuItems.restaurantId, restaurantId));
    if (dishes.length > 0) {
      await tx.insert(schema.menuItems).values(dishes.map((d) => ({
        id: `${restaurantId}:${d.id}`, dishId: d.id, restaurantId, name: d.name, basePrice: d.basePrice,
        description: d.desc, icon: d.icon, choice: d.choice ?? null, extras: d.extras ?? null,
      })));
    }
    return { ok: true, dishes };
  });
}
