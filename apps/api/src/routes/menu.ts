/**
 * เส้นทางจัดการเมนูฝั่งร้าน (Menu CRUD) — เทียบ store actions menuAddDish/menuUpdateDish/menuRemoveDish
 * ใช้ validation ชุดเดียวกับ web (โดเมน menu) แล้วเขียนทับเมนูของร้านใน DB
 * gate: แอดมิน หรือ merchant เจ้าของร้านนั้นเท่านั้น (requireMerchantOf จาก session)
 */
import type { FastifyInstance } from 'fastify';
import { addItem, updateItem, removeItem } from '@app/domain/menu/menu.js';
import type { ItemFields } from '@app/domain/menu/menu.js';
import type { Dish } from '@app/domain/catalog/catalog.js';
import { applyMenu } from '../services/catalog.js';
import { requireMerchantOf } from './auth.js';

export async function menuRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { dish: Dish } }>('/restaurants/:id/menu', async (req, reply) => {
    if (!await requireMerchantOf(req, reply, req.params.id)) return reply;
    const r = await applyMenu(req.params.id, (dishes) => addItem(dishes, req.body.dish));
    if (!r.ok) return reply.code(r.code).send({ error: r.reason });
    return { ok: true, dishes: r.dishes };
  });

  app.put<{ Params: { id: string; dishId: string }; Body: { fields: ItemFields } }>('/restaurants/:id/menu/:dishId', async (req, reply) => {
    if (!await requireMerchantOf(req, reply, req.params.id)) return reply;
    const r = await applyMenu(req.params.id, (dishes) => updateItem(dishes, req.params.dishId, req.body.fields));
    if (!r.ok) return reply.code(r.code).send({ error: r.reason });
    return { ok: true, dishes: r.dishes };
  });

  app.delete<{ Params: { id: string; dishId: string } }>('/restaurants/:id/menu/:dishId', async (req, reply) => {
    if (!await requireMerchantOf(req, reply, req.params.id)) return reply;
    const r = await applyMenu(req.params.id, (dishes) => removeItem(dishes, req.params.dishId));
    if (!r.ok) return reply.code(r.code).send({ error: r.reason });
    return { ok: true, dishes: r.dishes };
  });
}
