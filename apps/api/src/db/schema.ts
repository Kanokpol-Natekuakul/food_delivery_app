/**
 * Drizzle schema — ตารางที่สะท้อน State ของ store เดิม (ledger/disputes/rate/moderation)
 * ก้อน "เงิน" (orders, ledger_entries) ต้องอยู่ใน transaction เดียวกันเสมอ (ACID)
 */
import { pgTable, text, integer, boolean, real, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { OrderState } from '@app/domain/order/state.js';
import type { Amounts } from '@app/domain/settlement/settlement.js';
import type { PlacedOrder } from './types.js';

// ออเดอร์ + ประวัติ (per-party order history aggregate)
export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id'),
  riderId: text('rider_id'),
  customerId: text('customer_id'),
  placed: jsonb('placed').$type<PlacedOrder>().notNull(),
  // สแนปช็อตราคา ณ ตอนสั่ง (food/delivery/service) — ใช้คิด settlement ภายหลังโดยไม่ต้องคำนวณซ้ำ
  amounts: jsonb('amounts').$type<Amounts>().notNull(),
  state: jsonb('state').$type<OrderState>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// บัญชีแยกประเภท append-only (wallet/ledger ADR 0004)
export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey(),
  account: text('account').notNull(),
  amount: integer('amount').notNull(),
  kind: text('kind').notNull(), // 'credit' | 'refund' | 'payout'
  orderId: text('order_id').notNull(),
  memo: text('memo').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ร้องเรียนหลังส่ง (ADR 0006)
export const disputes = pgTable('disputes', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  customer: text('customer').notNull(),
  merchant: text('merchant').notNull(),
  rider: text('rider').notNull(),
  category: text('category').notNull(),
  hasPhoto: boolean('has_photo').notNull(),
  status: text('status').notNull(), // 'open' | 'refunded' | 'rejected'
  refund: integer('refund').notNull().default(0),
});

// คำขอปรับอัตราคอมมิชชัน — เจรจาสองทาง (ADR 0003)
export const rateRequests = pgTable('rate_requests', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
  currentRate: real('current_rate').notNull(),
  proposedRate: real('proposed_rate').notNull(),
  counterRate: real('counter_rate'),
  reason: text('reason').notNull().default(''),
  status: text('status').notNull(), // 'pending' | 'countered' | 'approved' | 'rejected'
});

// อัตราคอมที่เจรจาแล้วต่อร้าน (override)
export const rateOverrides = pgTable('rate_overrides', {
  merchantId: text('merchant_id').primaryKey(),
  commissionRate: real('commission_rate').notNull(),
});

// ผลกำกับดูแลรายฝ่าย (auto-action ขั้นบันได ADR 0006)
export const moderation = pgTable('moderation', {
  account: text('account').primaryKey(),
  suspended: boolean('suspended').notNull().default(false),
  downranked: boolean('downranked').notNull().default(false),
  notified: boolean('notified').notNull().default(false),
});

// ── Auth (Lucia) ──
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  // ตัวตนจริงแทนค่าฮาร์ดโค้ดเดิม เช่น 'rider:somchai', 'merchant:khao-man-kai', 'customer:aon'
  actorId: text('actor_id').notNull().unique(),
  role: text('role').notNull(), // 'customer' | 'merchant' | 'rider' | 'admin'
  passwordHash: text('password_hash').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});
