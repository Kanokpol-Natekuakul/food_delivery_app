# Food Delivery Marketplace

แพลตฟอร์ม marketplace ส่งอาหารครบ 4 ฝ่าย (ลูกค้า · ร้าน · ไรเดอร์ · แอดมิน)
ดูศัพท์โดเมนที่ [CONTEXT.md](./CONTEXT.md) · วงจรชีวิตออเดอร์ที่ [docs/order-lifecycle.md](./docs/order-lifecycle.md) · เหตุผลเชิงตัดสินใจที่ [docs/adr/](./docs/adr/)

## Monorepo (pnpm workspace)

แตกโดเมนเป็นแพ็กเกจกลางที่ web + api ใช้ร่วมกัน (client-only → มี backend):
```
packages/domain/   @app/domain — โดเมนบริสุทธิ์ TS (state machine, settlement, wallet, dispute, revenue, moderation) + เทสต์
apps/web/          @app/web — Vite SPA (4 ฝั่ง) — อ้างโดเมนผ่าน path alias @app/domain; มี src/api/client.ts (seam เรียก backend)
apps/api/          @app/api — Fastify + Postgres(Drizzle) + pg-boss(cron) + Lucia(auth) — **scaffold** (ดู apps/api/README.md)
```
เว็บอ้าง `@app/domain` ผ่าน **alias** (`apps/web/vite.config.ts` + `tsconfig` paths) จึง dev/test ได้ด้วย npm ที่ root ทันที **โดยไม่ต้อง pnpm install** (สคริปต์ root delegate เข้า `apps/web`/`packages/domain`); api อ้างผ่าน workspace dep (ต้อง `pnpm install` + build โดเมน)

**store → API (cutover ที่เหลือ)**: `apps/web/src/api/client.ts` มีฟังก์ชัน typed ครบทุก route แล้ว (seam). store ปัจจุบันยังเป็น in-memory reducer (เทสต์ใช้, offline ได้); สลับเป็น API-mode = ห่อ store ด้วย data layer (React Query) ที่ hydrate จาก `GET` + ยิง mutation ตาม action แทน dispatch — **ทำตอน apps/api รันจริง** (ต้องมี Postgres) จึง verify ได้

## การรัน (เว็บ — ที่ root)

```bash
npm install
npm run dev        # เปิด dev server (http://localhost:5173)
npm run typecheck  # tsc --noEmit (web + packages/domain)
npm test           # เทสต์ฝั่งโดเมน (packages/domain/src/**) — node:test
npm run test:ui    # เทสต์ฝั่ง UI (src/ui/**) — Vitest + Testing Library + jsdom
npm run build      # build production
```

## โครงสร้าง

```
docs/                      เอกสารออกแบบ (CONTEXT, order-lifecycle, ADR 0001–0007)
packages/domain/src/       @app/domain — ตรรกะบริสุทธิ์ ไม่พึ่ง UI (มีเทสต์; web อ้างผ่าน alias @app/domain)
    order/state.ts         state machine "2 รางวิ่งคู่กัน" (ร้าน × ไรเดอร์)
    order/transitions.ts   การเปลี่ยนสถานะ (คืน Result ไม่ throw) + adminCancel → CancelledByAdmin
    order/timers.ts        ค่าตัวจับเวลา (ยกเลิกฟรี/Y/Z/ส่งไม่ได้) + predicate
    order/merchantView.ts  OrderState → มุมมองฝั่งร้าน (ป้ายสถานะ + action ที่กดได้)
    order/riderView.ts     OrderState → มุมมองฝั่งไรเดอร์ (pickup โผล่เฉพาะตอนอาหารเสร็จ = จุดบรรจบ)
    cart/cart.ts           ตะกร้า + คิดราคา + tryAddLine (กฎ 1 ออเดอร์ = 1 ร้าน)
    delivery/delivery.ts   ระยะ haversine + ค่าส่งตามระยะ + Service Zone + checkServiceability (ADR 0005)
    menu/menu.ts           CRUD เมนู (เพิ่ม/แก้/ลบ + validation) คืน Result ไม่กลายพันธุ์
    settlement/settlement.ts สรุปยอด/ความรับผิดต่อออเดอร์ (ADR 0002/0003): ใครคืน/ได้/แบก
    moderation/moderation.ts ชุดผู้ใช้ที่ถูกระงับ (suspend/unsuspend/isSuspended) — Rider/Merchant suspension
    wallet/wallet.ts         ledger ภายใน (ADR 0004): balance/post/postSettlement/payout — เครดิตเมื่อจบ จ่ายออกเป็นรอบ
apps/web/src/ui/           React web (อ้างโดเมนผ่าน @app/domain)
    data/catalog.ts        ชนิดข้อมูล + seed เมนู + RATE_POLICY/ratesFor; findRestaurant/findDish รับลิสต์จาก store
    store.tsx              state รวม (useReducer) + persist(localStorage,เวอร์ชัน) + auto-action/history; cart+order+restaurants+orders+suspended/downranked/notified+ledger+disputes+rate*
    pages/Home.tsx         หน้าตลาด: ค้นหา / หมวดหมู่ / drawer / ลิสต์ร้าน
    pages/Restaurant.tsx   หน้าร้าน → ลิสต์เมนูของร้านนั้น  (/r/:restaurantId)
    pages/Menu.tsx         หน้าปรับแต่งเมนู → เพิ่มลงตะกร้า (/r/:restaurantId/:dishId)
    pages/Cart.tsx         ตะกร้า + สรุปราคา → สั่ง
    pages/Track.tsx        ติดตามออเดอร์ (state machine จริง + แผงเดโม + auto-fire Y/Z)
    pages/Merchant.tsx     คอนโซลฝั่งร้าน: รับ/ทำ/เสร็จ/ปฏิเสธ ออเดอร์ (/merchant)
    pages/MerchantMenu.tsx จัดการเมนูร้าน: เพิ่ม/แก้/ลบ → แก้ store ตรง ลูกค้าเห็นทันที (/merchant/menu)
    pages/Rider.tsx        คอนโซลฝั่งไรเดอร์: คว้างาน/ถึงร้าน/รับอาหาร/ส่ง/OTP (/rider)
    pages/Admin.tsx        ผู้ดูแล: wallet+payout · ลิสต์หลายออเดอร์+settlement · force-cancel · ระงับผู้ใช้ (/admin)
    order/orderView.ts     แปลง OrderState → view-model ของตัวติดตาม
    order/OrderTracker.tsx  คอมโพเนนต์ตัวติดตาม "รางคู่"
apps/web/src/api/client.ts ฟังก์ชัน fetch ผูกทุก route (seam สลับ store → backend)
apps/web/src/test/         โครงเทสต์ฝั่ง UI: setup.ts (jest-dom) + render.tsx (ห่อ provider)
apps/api/src/              backend (server/db/schema/routes/services/jobs/auth) — ดู apps/api/README.md
```

## เส้นทางหน้า (routes)

| path | หน้า |
|---|---|
| `/` | หน้าแรก/ตลาด |
| `/r/:restaurantId` | หน้าร้าน + เมนู |
| `/r/:restaurantId/:dishId` | ปรับแต่งเมนู |
| `/cart` | ตะกร้า |
| `/track` | ติดตามออเดอร์ (ฝั่งลูกค้า) |
| `/merchant` | คอนโซลรับออเดอร์ (ฝั่งร้าน) |
| `/merchant/menu` | จัดการเมนูร้าน (เพิ่ม/แก้/ลบ) |
| `/merchant/rate` | ดู/เจรจาอัตราคอมมิชชัน (ฝั่งร้าน) |
| `/rider` | คอนโซลไรเดอร์ (คว้างาน→รับ→ส่ง) |
| `/admin` | ผู้ดูแล: หลายออเดอร์ + settlement + กำกับดูแล + ร้องเรียนหลังส่ง |

## สถานะปัจจุบัน (V1 Customer Web)

### ✅ ทำแล้ว
- **โดเมน**: order lifecycle (2 ราง บรรจบที่ "ไรเดอร์รับอาหาร") + cart + delivery + timers + merchantView + riderView + menu CRUD + settlement + revenue (split + อัตราต่อร้าน/โซน + เจรจาคอมสองทาง) + moderation + wallet (ledger + รอบ/ถอนขั้นต่ำ + schedule) + dispute (สถิติ + auto-action ขั้นบันได) — เทสต์ผ่าน **109/109**
- **flow ลูกค้าครบวง**: หน้าแรก → เลือกร้าน → เมนูจริงของร้าน (6 ร้าน) → ปรับแต่ง → ตะกร้า → สั่ง → ติดตาม
- **ตะกร้าผูกกับ 1 ร้าน** (Order = ร้านเดียว ตาม CONTEXT) — สั่งข้ามร้าน **เด้ง confirm ถามก่อนล้าง** (โดเมน `tryAddLine`)
- **ค่าส่งตามระยะทาง** (ADR 0005): `domain/delivery` คิดระยะ haversine ร้าน→ลูกค้า → ค่าส่ง ฿15 + ฿7/กม. (Service Zone 6 กม.) แสดงระยะ+ค่าส่งจริงในตะกร้า
- **บังคับ Service Zone ใน UI**: `checkServiceability` (โดเมน) ตัดสิน "สั่งได้/นอกเขต" ครั้งเดียว → หน้าแรกติดป้าย "นอกพื้นที่", หน้าร้านขึ้นแบนเนอร์+ปิดการกดเมนู, หน้าเมนู/ตะกร้า disable ปุ่มสั่ง (กัน 3 ชั้น). มีร้าน seed นอกเขต `khao-tom-rung` (~10.8 กม.) ไว้เห็นผลจริง
- **ค่าตัวจับเวลา (timers)**: `domain/order/timers.ts` กำหนด หน้าต่างยกเลิกฟรี **90 วิ**, Y (Delivery Timeout) **15 น.**, Z (Claim Expiry) **8 น.**, ส่งไม่ได้ **รอ 10 น.+โทร 3** พร้อม predicate ป้อนเข้า transitions
- **auto-fire Y/Z**: หน้า Track มีนาฬิกาจำลอง (1 วิจริง = 1 นาทีจำลอง, เคารพ `prefers-reduced-motion` → กดเดินเวลาเองได้) ระบบ **ยกเลิกออเดอร์เองเมื่อครบ Y** และ **ปลดงานคืนลิสต์เองเมื่อครบ Z** โดย predicate โดเมนเป็นคนตัดสิน
- **หน้าแรก wired**: ช่องค้นหา (กรองร้านสด), หมวดหมู่ (กดกรอง/toggle), hamburger drawer (ลิงก์ใช้งานจริง)
- **หน้าติดตาม**: ตัวติดตามรางคู่ + แผงเดโมกดสั่ง state machine จริงทุก transition
- **คอนโซลฝั่งร้าน (Merchant)** `/merchant`: เห็นออเดอร์ที่เข้ามา (เมนู/ร้าน จากสแนปช็อต `placed` ตอนสั่ง) → กดรับ/ทำเสร็จ/ปฏิเสธ ตาม `merchantView` (โดเมนตัดสินว่ากดอะไรได้) — ขับ state machine รางร้านร่วมกับฝั่งลูกค้า
- **จัดการเมนูฝั่งร้าน (Merchant)** `/merchant/menu`: เพิ่ม/แก้/ลบ เมนู (โดเมน `menu` CRUD + validation) — **เมนูย้ายมาอยู่ใน store** (`state.restaurants`, seed จาก catalog) แก้แล้วฝั่งลูกค้าเห็นทันที (`findRestaurant/findDish` อ่านจาก store ทุกหน้า)
- **คอนโซลฝั่งไรเดอร์ (Rider)** `/rider`: คว้างาน → ถึงร้าน → รับอาหาร → ส่ง → ยืนยัน OTP ตาม `riderView` — ปุ่ม "รับอาหาร" โผล่เฉพาะตอนอาหารเสร็จ (จุดบรรจบ "2 ราง") ขับ state machine รางไรเดอร์ร่วมกับฝั่งร้าน/ลูกค้า ครบทั้ง 3 ฝั่ง
- **ผู้ดูแลระบบ (Admin)** `/admin`: **หลายออเดอร์พร้อมกัน** (`state.orders`) แต่ละรายการโชว์สถานะ 2 ราง + **สรุปการเงิน** เมื่อจบ (โดเมน `settlement` ตาม ADR 0002/0003: ฝ่ายผิด/คืน/แบก + **แตกส่วนแบ่ง** ร้าน−คอม/ไรเดอร์−ส่วนแบ่ง/แพลตฟอร์ม) · **force-cancel** ออเดอร์ที่ยังดำเนินอยู่ (`adminCancel` → `CancelledByAdmin`) · **กำกับดูแล** ระงับ/ปลดระงับ ไรเดอร์/ร้าน (โดเมน `moderation`)
- **แตกส่วนแบ่งคอมมิชชัน (ADR 0003)**: `domain/revenue` — `splitRevenue(amounts, rates)` แตกก้อนสุทธิ: ร้าน=อาหาร−คอมมิชชัน, ไรเดอร์=ค่าส่ง−ส่วนแบ่งแพลตฟอร์ม, แพลตฟอร์ม=คอม+บริการ+ส่วนแบ่ง (ค่าตั้งต้น คอม **30%** ของอาหาร, ส่วนแบ่งค่าส่ง **20%**, ปัดเป็นบาท). `settlement` ใช้ split เฉพาะเคสที่เกิดรายได้จริง (สำเร็จ/ส่งไม่ได้-ลูกค้าผิด) → `merchantPayout/riderPayout/platformNet` เป็นยอด**สุทธิ** + แนบ `split` ไว้ตรวจย้อน (เคสคืนเต็ม/ล้มเหลว split=null ไม่หักคอม); wallet เครดิตยอดสุทธิ; Admin โชว์บรรทัดแตกเงินต่อออเดอร์
- **อัตราต่อร้าน/โซน (ADR 0003)**: `revenue.resolveRates(policy, merchantId?, zone?)` หาอัตราจริงของออเดอร์ตามลำดับ **ร้าน > โซน > base** (merge partial). `catalog` มี `RATE_POLICY` (seed: โซน `outer` แบ่งค่าส่ง 10%, ร้าน `cha-maimuk` คอม 20%) + helper `ratesFor(restaurant, byMerchant?)` + ฟิลด์ `zone` บนร้าน. store/Admin คิด settlement ด้วยอัตราของร้านนั้น (ไม่ใช่อัตราเดียวทั้งระบบ); Admin โชว์ **% อัตราต่อออเดอร์** (เช่น #1039 คอม 20% ≠ #1038 คอม 30%)
- **เจรจาอัตราคอมสองทาง (ADR 0003)**: `revenue` มี state machine คำขอ `pending → countered → approved/rejected` — `requestRate` (ร้านเสนอต่ำกว่าปัจจุบัน), `approveRate`/`rejectRate` (แอดมิน), `counterRate` (แอดมินเสนอแย้ง: ต้องอยู่ "ระหว่าง" ที่ขอกับปัจจุบัน), `acceptCounter`/`declineCounter` (ร้านตอบ), `agreedRate` (อัตราที่ตกลง = counter ถ้ามี ไม่งั้น proposed). อัตรา override เป็น **state แก้ได้** (`state.rateOverrides` + `state.rateRequests`); อนุมัติ/ตอบรับ → `applyApprovedRate` อัปเดต override → มีผล settlement รอบถัดไป. หน้า `/merchant/rate`: ร้านดูอัตรา + ยื่นขอลด + **ตอบรับ/ปฏิเสธข้อเสนอแย้ง**; หน้า `/admin` แผงคำขอ: **อนุมัติ/เสนอแย้ง (กรอก %)/ปฏิเสธ** (ลิงก์ "ค่าคอม ›" บนคอนโซลร้าน)
- **suspend บล็อก claim จริง**: คอนโซลไรเดอร์มีตัวตน (`rider:somchai`) — แอดมินระงับ → `claimJob` ปฏิเสธ (ctx `riderSuspended`) + หน้า Rider ขึ้นแบนเนอร์และปิดปุ่มคว้างาน (เชื่อม Admin ↔ Rider จริง)
- **Wallet ภายใน (ADR 0004)**: `domain/wallet` เป็น ledger append-only — ออเดอร์จบ → เครดิตเข้า wallet ร้าน/ไรเดอร์/แพลตฟอร์ม (escrow), refund เป็นรายการบัญชี; หน้า `/admin` โชว์ยอดแต่ละบัญชี + ปุ่ม **จ่ายออก** ทำให้ยอดเป็น 0; force-cancel ก็ลงบัญชีให้อัตโนมัติ (`state.ledger`)
- **รอบ settlement + ยอดถอนขั้นต่ำ (ADR 0004)**: `domain/wallet` มีนโยบายรอบจ่ายเงิน — `MIN_PAYOUT` (ตั้งต้น **฿50**) เป็นยอดสะสมขั้นต่ำต่อบัญชีก่อนถอนได้, `isPayable`/`payableAccounts` คัดบัญชีที่ถึงเกณฑ์ (ไม่รวมบัญชีติดตาม `REFUNDS`), `runSettlement` **รันรอบเดียวจ่ายทุกบัญชีที่ถึงเกณฑ์** ที่ยังไม่ถึงคงไว้สะสมรอบหน้า. หน้า `/admin` โชว์ปุ่ม "รันรอบ settlement (กดถอนเอง)" + ป้าย "ต่ำกว่าขั้นต่ำ · สะสมรอบหน้า" ต่อบัญชีที่ยังไม่ถึง (ปุ่มจ่ายออกรายบัญชีโผล่เฉพาะที่ถึงเกณฑ์)
- **schedule รอบ settlement อัตโนมัติ ผูกเวลาจริง (ADR 0004)**: `wallet.isSettlementDueAt(nowMs, lastRunMs, cadence)` + `nextSettlementAt` + `CADENCE_MS` (`daily`=1 วัน, `weekly`=7 วัน) ตัดสินด้วย **เวลาจริง (wall clock)**. หน้า `/admin` มี `SettlementScheduler` ที่ **จำรอบล่าสุดใน `localStorage`** (`settlement.lastRunAt`/`settlement.cadence`) ข้ามรีโหลด — เปิดหน้า/ครบเวลาจริง ระบบ **รันรอบจ่ายเงินเอง** + เลื่อนรอบล่าสุด + โชว์ "รอบถัดไป (เวลาจริง): …"; ปุ่มสลับ รายวัน/สัปดาห์. ครั้งแรกสุดตั้งรอบล่าสุด = ตอนนี้ (ไม่จ่ายทันที). ยังเหลือ: ผูกกับ cron/เซิร์ฟเวอร์จริง (ตอนนี้ทำงานฝั่ง client เมื่อเปิดหน้า)
- **ร้องเรียนหลังส่ง (ADR 0006)**: `domain/dispute` เป็น flow **นอกวงจรชีวิตออเดอร์** (เกิดหลัง Completed) — ลูกค้ายื่นร้องเรียนภายในหน้าต่าง (ตั้งต้น 2 ชม.) + ต้องแนบรูป → แอดมินเลือก **คืน goodwill** (แพลตฟอร์มแบกเอง ผ่าน `postGoodwill` ลง `state.ledger`) หรือ **ปฏิเสธ** (สงสัยโกง); เก็บ **สถิติรายฝ่าย** (`complaintsAgainst`/`complaintsBy`) ไว้กู้การระบุความผิดระยะยาว. UI: หน้า Track โผล่กล่อง "แจ้งปัญหาหลังรับของ" เมื่อออเดอร์สำเร็จ; หน้า `/admin` มีแผง "ร้องเรียนหลังส่ง" (goodwill/ปฏิเสธ + สถิติ)
- **เกณฑ์สถิติร้องเรียน (ADR 0006)**: `domain/dispute` ตัดสินจาก **อัตรา** (เคส/ออเดอร์) ไม่ใช่จำนวนดิบ เพื่อเป็นธรรมกับฝ่ายปริมาณสูง — `complaintRate` + `flag(count, totalOrders, limit)` คืนระดับ `ok | watch | action` (มี **min-sample guard** `MIN_ORDERS_FOR_RATE`=5 กันฝ่ายใหม่โดนตัดสินจากเคสเดียว → จับตาแทน); `flagParty` (ร้าน/ไรเดอร์ เกณฑ์ **20%**, ใช้เคสไม่ถูกปฏิเสธ) / `flagCustomer` (ลูกค้า เกณฑ์ **30%**, นับทุกเคสรวมถูกปฏิเสธ = กันโกง). หน้า `/admin` แผงกำกับดูแลโชว์อัตรา + ป้าย **ปกติ/จับตา/ดำเนินการ** ต่อผู้ใช้ — เกณฑ์ปรับได้ที่ค่าคงที่ในโดเมน
- **ปริมาณออเดอร์จริงเป็นตัวหาร (ADR 0006)**: `AdminOrder` เก็บ `rider`/`customer` ที่เกี่ยวข้อง; `store.orderVolume(orders, account)` นับออเดอร์จริงต่อฝ่าย (ร้าน=ตาม restaurantId, ไรเดอร์/ลูกค้า=ตามฟิลด์) — ใช้แทนค่าเดโมเดิมในทุกจุดที่คิดอัตรา (แผงกำกับดูแล, ป้ายลูกค้าในแผงร้องเรียน, ฐาน auto-suspend). seed ผูกฝ่ายครบทุกออเดอร์ → ปริมาณยังน้อย (≤3) จึงเป็น "จับตา" สูงสุด; การไปถึง "ดำเนินการ" ต้องมีออเดอร์สะสม ≥5 ตาม min-sample (สมจริง)
- **auto-action ขั้นบันได (ADR 0006)**: `dispute.autoActions(level)` คืนการลงโทษ **สะสม** ตามระดับ — `watch → ['notify']`, `action → ['notify','downrank','suspend']`; `planAutoActions(disputes, parties, applied)` วางแผนเฉพาะที่ "ยังไม่ได้ทำ" (idempotent). store เรียก `applyAutoActions` หลังทุกการเปลี่ยน disputes → อัปเดต `state.notified`/`state.downranked`/`state.suspended` (ตัวหาร = `orderVolume` จริง). นโยบาย one-directional (ยกระดับเอง ไม่ถอนคืนเอง). หน้า `/admin` โชว์ป้าย **⚠️ แจ้งเตือน / ⬇️ ลดอันดับ / พักงาน** ต่อฝ่าย; **หน้า `/rider` ขึ้นแบนเนอร์แจ้งเตือน/ถูกลดอันดับ** ให้ไรเดอร์เห็น
- **ลดอันดับมีผลกับ ranking หน้า Home จริง (ADR 0006)**: `moderation.rankByStanding(items, key, downranked)` (pure, stable partition — ฝ่ายที่ถูกลดอันดับไปท้ายลิสต์ คงลำดับเดิมในกลุ่ม ไม่กลายพันธุ์). หน้า Home จัดลำดับทั้งลิสต์ "เปิดอยู่ตอนนี้" + "ใกล้คุณ" ด้วยฟังก์ชันนี้ (key = `merchant:<id>`) → ร้านที่โดน `downrank` ตกไปอยู่ท้ายจริง
- **ลดอันดับมีผลกับการจ่ายงานไรเดอร์จริง (ADR 0001 pull-based + 0006)**: `timers.isPriorityHeld(downranked, elapsedSec, window)` + `RIDER_PRIORITY_WINDOW_SEC` (30 วิ); `claimJob(state, { riderSuspended, priorityHeld })` ปฏิเสธคว้างานเมื่อ `priorityHeld`. หน้า `/rider` ไรเดอร์ที่ถูกลดอันดับเห็นแบนเนอร์ "⏳ ให้สิทธิ์ไรเดอร์อันดับสูงก่อน (เหลือ N วิ)" + ปุ่มคว้างานถูกปิดจนพ้นช่วง (นาฬิกาจริง 1 วิ/ครั้ง + ปุ่ม "ข้ามช่วงรอ (เดโม)")
- **per-party order history aggregate จริง (ADR 0006)**: `AdminOrder` มี `rider`/`customer`; เมื่อ**ออเดอร์สดสำเร็จครั้งแรก** (`setOrder` → Completed) ระบบ **ต่อท้ายเข้า `state.orders`** (รหัส `LV*`) + ลงบัญชี → `orderVolume` (ตัวหารอัตราร้องเรียน) สะท้อนออเดอร์จริงที่สะสมข้ามเซสชัน (คู่กับ persist) ไม่ใช่ dataset คงที่
- **persist: เวอร์ชัน/ไมเกรชัน + รีเซ็ต**: เก็บเป็น `{ v: STATE_VERSION, s }` — โหลดแล้วเวอร์ชันไม่ตรง → ทิ้งของเก่าเริ่มจาก seed; `clearPersistedState()` + action `resetApp` (ปุ่ม "ล้างข้อมูลที่บันทึก" ท้ายหน้า `/admin`) คืนค่าตั้งต้น
- **persist state ข้ามรีโหลด**: `StoreProvider` รับ prop `persist` — โหมดนี้ init โหลด state จาก `localStorage` (`food-app.state`, merge ทับ `__seed` ให้ฟิลด์ใหม่มีค่าตั้งต้น) และ `useEffect` บันทึกทุกครั้งที่ state เปลี่ยน; `main.tsx` ใช้ `<StoreProvider persist>` (แอปจริงจำตะกร้า/ออเดอร์/ledger/คำขอ ข้ามรีเฟรช). **เทสต์ไม่เปิด persist** (renderWithProviders ไม่ส่ง prop) จึงไม่แตะ localStorage — แยกสถานะสะอาด; กรณีพัง/parse ไม่ได้ fallback เป็น seed
- **UI tests** (Vitest + Testing Library + jsdom): `npm run test:ui` **51/51** — Home (ค้นหา/หมวด/Service Zone + ลดอันดับ ranking) · Track (auto-fire Y/Z, ร้องเรียนหลังส่ง) · Menu (บล็อกนอกเขต, สั่งข้ามร้าน confirm) · Cart (ในเขต/นอกเขต) · Merchant (รับ→ทำ→เสร็จ, ปฏิเสธ) · MerchantMenu (CRUD + integration แก้ฝั่งร้าน→ลูกค้าเห็น) · MerchantRate (ดูอัตรา + ยื่นขอลด + end-to-end อนุมัติ + เสนอแย้ง→ตอบรับ) · Rider (จุดบรรจบ→รับ→ส่ง→OTP→สำเร็จ, ถูกพักงานคว้าไม่ได้, ถูกลดอันดับติดช่วงรอ) · Admin (settlement + แตกส่วนแบ่ง + อัตราต่อร้าน, force-cancel, ระงับผู้ใช้, wallet payout + รอบ settlement/ถอนขั้นต่ำ + schedule อัตโนมัติ, dispute goodwill/ปฏิเสธ, สถิติร้องเรียน จับตา/ดำเนินการ, auto-suspend, อนุมัติ/เสนอแย้งอัตราคอม) + auto-action ขั้นบันได (จับตา→แจ้งเตือน, ดำเนินการ→ลดอันดับ+ระงับ) · store.persist (จำ state ข้าม mount + เวอร์ชันไม่ตรงเริ่ม seed + ประวัติออเดอร์โตเมื่อสำเร็จ); helper `src/test/render.tsx` ห่อ store+router (รับ `initialEntries`/`initialState`), `StoreProvider` รับ `initialState` ไว้จำลองสถานการณ์
- **หมายเหตุรันเทสต์ UI บน Windows**: worker fork แบบขนานบางครั้ง crash (resource) — ใช้ `npx vitest run --no-file-parallelism` ได้ผลคงที่ (10 ไฟล์ 51 เทสต์ผ่าน)

### 🚧 ยังเหลือ / roadmap
- [ ] **ส่วนที่ยังเป็น UI ตกแต่ง (ยังไม่ wire)**: ปุ่มที่อยู่จัดส่ง (📍), "ดูทั้งหมด/ดูแผนที่", โปรไฟล์
- [ ] **ฝั่ง Merchant (ต่อ)**: ลิสต์หลายออเดอร์พร้อมกัน, แก้ option group/extras ของเมนู (ตอนนี้ CRUD ระดับเมนู: ชื่อ/ราคา/คำอธิบาย แล้ว)
- [ ] **ต้องมี backend จริง (เกินขอบเขต client-only V1)**: schedule รอบ settlement ผูก cron/เซิร์ฟเวอร์ที่รันแม้ไม่มีใครเปิดหน้า (ตอนนี้ทำได้สุดที่ฝั่ง client = เวลาจริง + localStorage), ฐานข้อมูล/บัญชีจริงแทน in-memory store + persist localStorage, ออเทนติเคชันผู้ใช้จริง (ตอนนี้ตัวตนฝั่งร้าน/ไรเดอร์/ลูกค้าเป็นค่าฮาร์ดโค้ดเดโม)
- [x] **ครบทุก actor + วงจรกำกับดูแลครบ**: ทั้ง 4 ฝั่ง + รายได้/settlement/wallet + ร้องเรียน/สถิติ/auto-action ขั้นบันได (แจ้งเตือน→ลดอันดับ→ระงับ) ผูกผลจริงทั้ง ranking หน้า Home และการจ่ายงานไรเดอร์ + เจรจาอัตราคอมสองทาง + persist ข้ามรีโหลด พร้อมเวอร์ชัน/รีเซ็ต
