/** จุดเริ่ม API — Fastify + เส้นทางที่โฮสต์โดเมน + cron settlement */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { orderRoutes } from './routes/orders.js';
import { disputeRoutes } from './routes/disputes.js';
import { rateRequestRoutes } from './routes/rateRequests.js';
import { moderationRoutes } from './routes/moderation.js';
import { settlementRoutes } from './routes/settlement.js';
import { startSettlementScheduler } from './jobs/settlement.js';

const app = Fastify({ logger: true });
await app.register(cookie);

app.get('/health', async () => ({ ok: true }));
await app.register(orderRoutes);
await app.register(disputeRoutes);
await app.register(rateRequestRoutes);
await app.register(moderationRoutes);
await app.register(settlementRoutes);

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });

// เปิดตัวตั้งเวลา settlement (pg-boss) — รันรอบจ่ายเงินเองตามคาบ
await startSettlementScheduler();
app.log.info('settlement scheduler started');
