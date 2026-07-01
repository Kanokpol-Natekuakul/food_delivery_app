/**
 * รอบ settlement อัตโนมัติด้วย pg-boss (ADR 0004) — "cron จริง" ที่รันแม้ไม่มีใครเปิดหน้า
 * เก็บงานไว้ใน Postgres → ทนต่อ restart/scale; ตั้งคาบรายวันด้วย cron expression
 */
import PgBoss from 'pg-boss';
import { runSettlementOnce } from '../routes/settlement.js';

const QUEUE = 'settlement-cycle';

export async function startSettlementScheduler(): Promise<PgBoss> {
  const boss = new PgBoss(process.env.DATABASE_URL!);

  // ดัก event 'error' ของ pg-boss (เช่น การเชื่อมต่อ DB หลุดกลางคัน 57P01) — ถ้าไม่ดัก
  // EventEmitter จะ throw จน process ตายทั้งตัว (ทั้งเซิร์ฟเวอร์ล่ม แม้ route ปกติไม่เกี่ยว).
  // ดักไว้ให้แค่ log แล้วปล่อย pg-boss สร้าง connection ใหม่ตอน poll รอบถัดไปเมื่อ DB กลับมา (กู้คืนเอง).
  boss.on('error', (err) => {
    console.error('[pg-boss] ข้อผิดพลาด (เซิร์ฟเวอร์ยังทำงานต่อ):', err instanceof Error ? err.message : err);
  });

  await boss.start();
  await boss.createQueue(QUEUE); // pg-boss v10: ต้องสร้างคิวก่อน work/schedule

  await boss.work(QUEUE, async () => {
    const r = await runSettlementOnce();
    console.log(`[settlement] รอบอัตโนมัติเสร็จ — ลงบัญชี ${r.posted} รายการ`);
  });

  // รายวัน 00:10 (เวลาเซิร์ฟเวอร์) — เปลี่ยนเป็นรายสัปดาห์ได้ด้วย cron '10 0 * * 1'
  await boss.schedule(QUEUE, '10 0 * * *');
  return boss;
}
