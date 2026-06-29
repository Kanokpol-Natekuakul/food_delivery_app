# @app/api — Backend (Fastify + Postgres/Drizzle + pg-boss + Lucia)

โฮสต์โดเมน `@app/domain` (โค้ดเดียวกับเว็บ) บนเซิร์ฟเวอร์จริง — แก้ 3 ข้อที่ client-only ทำไม่ได้:
**cron จริง** (pg-boss), **ฐานข้อมูลจริง** (Postgres), **ออเทนฯ จริง** (Lucia)

> สถานะ: **scaffold** — โค้ดวางโครงครบ แต่ยังไม่ได้ `pnpm install` / ต่อ DB จริงในเครื่องนี้

## โครงสร้าง
```
src/
  server.ts             Fastify + ลงทะเบียน routes + เปิด cron
  db/schema.ts          ตาราง Drizzle (orders, ledger_entries, disputes, rate_requests, rate_overrides, moderation, users, sessions)
  db/index.ts           drizzle client (postgres-js)
  services/ledger.ts    สะพาน DB ↔ โดเมน wallet (โหลด Ledger / persist รายการที่ append)
  services/moderation.ts บริการ auto-action ขั้นบันได (planAutoActions) — ใช้ซ้ำใน route + หลังยื่นร้องเรียน
  routes/orders.ts      GET /orders · POST /orders/:id/cancel (adminCancel + settlement)
  routes/disputes.ts    GET /disputes · POST /disputes (file + auto-action) · POST /disputes/:id/resolve (goodwill)
  routes/rateRequests.ts GET + POST /rate-requests · /:id/{approve,reject,counter,accept,decline} (เจรจาสองทาง)
  routes/moderation.ts  GET /moderation · /:account/{suspend,unsuspend} · POST /moderation/run-auto-actions
  routes/settlement.ts  GET /wallet · POST /settlement/run (runSettlement)
  jobs/settlement.ts    pg-boss schedule รอบ settlement รายวัน (cron จริง)
  auth/lucia.ts         Lucia + adapter Drizzle (ตัวตนจริงแทน rider:somchai ฯลฯ)
```

## หลักการย้าย (ไม่ rewrite โดเมน) — reducer action → route ห่อ `db.transaction(...)` เรียกฟังก์ชันโดเมนเดิม (pure)
| store action | route | ฟังก์ชันโดเมน |
|---|---|---|
| `adminCancelOrder` | `POST /orders/:id/cancel` | `adminCancel` + `settle` + `postSettlement` |
| `fileDispute` (+auto) | `POST /disputes` | `fileComplaint` + `planAutoActions` |
| `resolveDispute` | `POST /disputes/:id/resolve` | `resolveGoodwill` + `postGoodwill` |
| `submit/approve/reject/counter/accept/declineRate*` | `POST /rate-requests[...]` | `requestRate`/`approveRate`/`counterRate`/`acceptCounter`/`agreedRate` |
| `toggleSuspend` / auto-action | `POST /moderation/:account/suspend` · `/run-auto-actions` | `planAutoActions` |
| `walletRunSettlement` | `POST /settlement/run` | `runSettlement` |

## รันจริง
```bash
pnpm install                      # ที่ root (ลิงก์ workspace @app/domain)
pnpm --filter @app/domain build   # คอมไพล์โดเมนเป็น dist (api อ้างผ่าน exports)
cp apps/api/.env.example apps/api/.env   # ตั้ง DATABASE_URL
pnpm --filter @app/api db:generate && pnpm --filter @app/api db:migrate
pnpm --filter @app/api dev        # tsx watch (dev อ้างโดเมนผ่าน tsconfig paths → ../../packages/domain/src)
```

## ที่ยังต้องทำต่อ
- routes เมนู/ร้าน (menu CRUD) + seed DB จาก catalog เดิม + migration จริง
- เชื่อม auth (Lucia) เข้ากับ routes (แทน actor ฮาร์ดโค้ดด้วย session.user.actorId)
- ฝั่งเว็บเปลี่ยน store จาก in-memory → เรียก API (React Query) แล้วย้าย web เข้า `apps/web`

> หมายเหตุ: ยังไม่ได้ `pnpm install`/typecheck ในเครื่องนี้ (ไม่มี deps/DB) — routes เขียนให้ตรง signature โดเมนที่มีเทสต์ครบ 109 เคสแล้ว ตรวจ type จริงเมื่อ `pnpm install`
