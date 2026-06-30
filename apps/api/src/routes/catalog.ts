/**
 * เส้นทาง catalog (อ่านอย่างเดียว) — ร้าน + เมนู
 * ฝั่ง web ใช้ hydrate state.restaurants แทนการ hardcode (จุด cutover)
 */
import type { FastifyInstance } from 'fastify';
import { loadRestaurants, loadRestaurant } from '../services/catalog.js';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // รายการร้านทั้งหมด (พร้อมเมนู) — รูปตรงชนิด Restaurant[] ของ domain
  app.get('/restaurants', async () => loadRestaurants());

  // ร้านเดียวพร้อมเมนู
  app.get<{ Params: { id: string } }>('/restaurants/:id', async (req, reply) => {
    const r = await loadRestaurant(req.params.id);
    if (!r) return reply.code(404).send({ error: 'ไม่พบร้าน' });
    return r;
  });
}
