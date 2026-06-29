/** เส้นทาง settlement — รันรอบจ่ายเงิน (เรียกได้เองจาก cron job ด้วย ดู jobs/settlement.ts) */
import type { FastifyInstance } from 'fastify';
import { runSettlement, balance, accounts } from '@app/domain/wallet/wallet.js';
import { db } from '../db/index.js';
import { loadLedger, persistAppended } from '../services/ledger.js';

/** รันรอบ settlement หนึ่งครั้ง (จ่ายทุกบัญชีที่ถึงยอดถอนขั้นต่ำ) — คืนจำนวนรายการที่ลง */
export async function runSettlementOnce(): Promise<{ posted: number }> {
  return db.transaction(async (tx) => {
    const before = await loadLedger(tx);
    const after = runSettlement(before);
    await persistAppended(tx, before, after);
    return { posted: after.length - before.length };
  });
}

export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.get('/wallet', async () => {
    const ledger = await db.transaction((tx) => loadLedger(tx));
    return accounts(ledger).map((account) => ({ account, balance: balance(ledger, account) }));
  });

  app.post('/settlement/run', async () => runSettlementOnce());
}
