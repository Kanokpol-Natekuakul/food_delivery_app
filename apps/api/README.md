# @app/api — Backend (Fastify + Postgres/Drizzle + pg-boss + Lucia)

โฮสต์โดเมน `@app/domain` (โค้ดเดียวกับเว็บ) บนเซิร์ฟเวอร์จริง — แก้ 3 ข้อที่ client-only ทำไม่ได้:
**cron จริง** (pg-boss), **ฐานข้อมูลจริง** (Postgres), **ออเทนฯ จริง** (Lucia)

> สถานะ: **รัน end-to-end ได้จริงแล้ว** บน Postgres (Docker) — typecheck ผ่าน, migrate+seed+ยิง endpoint ผ่าน (ดู "รันจริง")

## โครงสร้าง
```
src/
  server.ts             Fastify + ลงทะเบียน routes + เปิด cron
  db/schema.ts          ตาราง Drizzle (restaurants, menu_items, orders, ledger_entries, disputes, rate_requests, rate_overrides, moderation, users, sessions)
  db/index.ts           drizzle client (postgres-js)
  db/seed.ts            seed ร้าน+เมนูจาก @app/domain/catalog (npm run db:seed)
  services/catalog.ts   loadRestaurants/loadRestaurant (ประกอบ nested Restaurant[]) + seedCatalog
  services/ledger.ts    สะพาน DB ↔ โดเมน wallet (โหลด Ledger / persist รายการที่ append)
  services/moderation.ts บริการ auto-action ขั้นบันได (planAutoActions) — ใช้ซ้ำใน route + หลังยื่นร้องเรียน
  routes/catalog.ts     GET /restaurants · GET /restaurants/:id (อ่านอย่างเดียว — web hydrate จากนี่)
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

## รันจริง (ทดสอบผ่านแล้วบนเครื่องนี้)
```bash
# 1) deps (isolated — ไม่ใช้ pnpm workspace; ไม่กระทบ root node_modules ของ web/domain)
npm install --prefix apps/api

# 2) Postgres ใน Docker — พอร์ต 5433 เลี่ยงชน Postgres เดิมของเครื่องที่ 5432
docker run -d --name fd-postgres -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=devuser \
  -e POSTGRES_DB=food_delivery -p 5433:5432 postgres:16-alpine
# apps/api/.env มี DATABASE_URL ชี้ 5433 อยู่แล้ว (gitignored)

# 3) migrate + seed + รัน (scripts โหลด .env ด้วย --env-file เอง)
npm run db:migrate --prefix apps/api   # สร้าง 10 ตาราง
npm run db:seed    --prefix apps/api   # 7 ร้าน + 25 เมนู
npm run dev        --prefix apps/api   # http://localhost:3001
# ตรวจ: curl http://localhost:3001/restaurants

# typecheck (deps isolated): tsc -p apps/api/tsconfig.typecheck.json
```
> **drizzle-kit generate** (สร้างไฟล์ migration จาก schema) รันออฟไลน์ได้ ไม่ต้องต่อ DB
> **POST แบบไม่มี body** (เช่น `/rate-requests/:id/accept`): web client (fetch) ไม่แนบ content-type จึงผ่าน; ถ้าทดสอบด้วย PowerShell/curl ต้องส่ง `-ContentType application/json -Body '{}'` ไม่งั้นโดน 415

## Auth (Lucia) — ทำแล้ว
- `POST /auth/login` {actorId, password} → ตรวจ scrypt → ตั้ง session cookie; `POST /auth/logout`; `GET /auth/me`
- guard ใน `routes/auth.ts`: `requireUser` (401 ถ้าไม่ล็อกอิน) / `requireAdmin` (403 ถ้าไม่ใช่ admin) — อ่าน session ผ่าน `readSession` (auth/lucia.ts)
- wire: `POST /disputes` ตัวตนผู้ร้อง = session.actorId, คู่กรณีจากออเดอร์ (ไม่เชื่อ body); moderation mutations = แอดมินเท่านั้น
- รหัสผ่าน: `node:crypto` scrypt (ไม่พึ่ง native dep) เก็บเป็น `salt:hash`
- seed users (`npm run db:seed`): customer:aon / merchant:khao-man-kai / rider:somchai / admin:root — รหัส `demo1234`

## ที่ยังต้องทำต่อ
- ฝั่งเว็บ: หน้า login + ส่ง session (ตอนนี้ store ตัวตนยังฮาร์ดโค้ดเดโม) + cutover tail (create mutations, menu/place endpoints)
- (ออปชัน) เปลี่ยนมาใช้ pnpm workspace จริง (`@app/domain` เป็น workspace dep + build dist) แทน isolated install
