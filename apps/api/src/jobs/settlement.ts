/**
 * รอบ settlement อัตโนมัติด้วย pg-boss (ADR 0004) — "cron จริง" ที่รันแม้ไม่มีใครเปิดหน้า
 * เก็บงานไว้ใน Postgres → ทนต่อ restart/scale; ตั้งคาบรายวันด้วย cron expression
 */
import PgBoss from 'pg-boss';
import { runSettlementOnce } from '../routes/settlement.js';

const QUEUE = 'settlement-cycle';

export async function startSettlementScheduler(): Promise<PgBoss> {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  await boss.start();

  await boss.work(QUEUE, async () => {
    const r = await runSettlementOnce();
    console.log(`[settlement] รอบอัตโนมัติเสร็จ — ลงบัญชี ${r.posted} รายการ`);
  });

  // รายวัน 00:10 (เวลาเซิร์ฟเวอร์) — เปลี่ยนเป็นรายสัปดาห์ได้ด้วย cron '10 0 * * 1'
  await boss.schedule(QUEUE, '10 0 * * *');
  return boss;
}
