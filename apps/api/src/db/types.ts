/** สแนปช็อตเมนูที่ลูกค้าสั่ง (เหมือน PlacedOrder ฝั่ง store) */
import type { OrderLine } from '@app/domain/cart/cart.js';

export type PlacedOrder = { restaurantId: string | null; lines: OrderLine[] };
