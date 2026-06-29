/**
 * สะพานระหว่างตาราง ledger_entries กับโดเมน wallet (Ledger append-only)
 * โหลด DB → โดเมน, ทำงานด้วยฟังก์ชันโดเมน, แล้ว insert เฉพาะ "รายการใหม่ที่ถูก append"
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Ledger } from '@app/domain/wallet/wallet.js';
import { schema } from '../db/index.js';
import type { Db } from '../db/index.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** โหลด ledger ทั้งหมดเป็นชนิดโดเมน (ตามลำดับเวลา — append-only) */
export async function loadLedger(tx: Tx): Promise<Ledger> {
  const rows = await tx.select().from(schema.ledgerEntries).orderBy(schema.ledgerEntries.createdAt);
  return rows.map((r) => ({ account: r.account, amount: r.amount, kind: r.kind as Ledger[number]['kind'], orderId: r.orderId, memo: r.memo }));
}

/** บันทึกเฉพาะรายการที่โดเมน append เพิ่ม (before = ledger ก่อนทำ, after = หลังทำ) */
export async function persistAppended(tx: Tx, before: Ledger, after: Ledger): Promise<void> {
  const added = after.slice(before.length);
  if (added.length === 0) return;
  await tx.insert(schema.ledgerEntries).values(
    added.map((e) => ({ id: randomUUID(), account: e.account, amount: e.amount, kind: e.kind, orderId: e.orderId, memo: e.memo })),
  );
}
