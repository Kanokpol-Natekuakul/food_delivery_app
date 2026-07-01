# Food Delivery Marketplace

แพลตฟอร์ม marketplace ส่งอาหารครบ 4 ฝ่าย (ลูกค้า · ร้าน · ไรเดอร์ · แอดมิน)
ดูศัพท์โดเมนที่ [CONTEXT.md](./CONTEXT.md) · วงจรชีวิตออเดอร์ที่ [docs/order-lifecycle.md](./docs/order-lifecycle.md) · เหตุผลเชิงตัดสินใจที่ [docs/adr/](./docs/adr/)

## Monorepo (pnpm workspace)

แตกโดเมนเป็นแพ็กเกจกลางที่ web + api ใช้ร่วมกัน (client-only → มี backend):
```
packages/domain/   @app/domain — โดเมนบริสุทธิ์ TS (state machine, settlement, wallet, dispute, revenue, moderation) + เทสต์
apps/web/          @app/web — Vite SPA (4 ฝั่ง) — อ้างโดเมนผ่าน path alias @app/domain; มี src/api/client.ts (seam เรียก backend)
apps/api/          @app/api — Fastify + Postgres(Drizzle) + pg-boss(cron) + Lucia(auth) — **รัน end-to-end ได้จริงแล้ว** (ดู apps/api/README.md)
```
เว็บอ้าง `@app/domain` ผ่าน **alias** (`apps/web/vite.config.ts` + `tsconfig` paths) จึง dev/test ได้ด้วย npm ที่ root ทันที **โดยไม่ต้อง pnpm install** (สคริปต์ root delegate เข้า `apps/web`/`packages/domain`); api ติดตั้ง deps แบบ **isolated** ใน `apps/api/node_modules` (`npm install --prefix apps/api`) แล้ว typecheck ด้วย `tsc -p apps/api/tsconfig.typecheck.json` ได้โดยไม่กระทบชุด web/domain

**catalog เป็น single source**: ข้อมูลร้าน+เมนูอยู่ที่ `packages/domain/src/catalog/catalog.ts` — web ใช้เป็น reference data (`data/catalog.ts` เป็น re-export shim), api seed ลง DB (`npm run db:seed`) + เสิร์ฟผ่าน `GET /restaurants`, `GET /restaurants/:id`

**apps/api รันจริงแล้ว** (Postgres ใน Docker พอร์ต 5433): typecheck ผ่าน, `db:migrate`+`db:seed` (7 ร้าน/25 เมนู) + ยิง `GET /restaurants` ได้ JSON จริง + flow เจรจาอัตราคอม (submit→counter→accept) เขียนลง DB ได้ — ดูวิธีรันที่ `apps/api/README.md`

**store → API cutover (กำลังทำทีละ slice)**: `apps/web/src/api/client.ts` typed ครบทุก route.
- **slice 1 ✅ (read: ร้าน/เมนู)**: `StoreProvider` รับ prop `hydrate` (`true`=ใช้ API จริง, หรือ inject `HydrateSource` ในเทสต์) → ตอน mount ยิง `GET /restaurants` แล้ว dispatch `hydrate` แทน `state.restaurants` (ล้มเหลว→คงร้าน seed ใช้ออฟไลน์ได้). `main.tsx` เปิด `<StoreProvider persist hydrate>`. CORS (`@fastify/cors`) ปล่อย origin :5173 + credentials.
- **slice 2 ✅ (read: admin)**: hydrate ดึงทุก GET ที่ source มี → ประกอบ patch ก้อนเดียว ผ่าน adapter: `orders` (ApiOrder→AdminOrder), `moderation` (per-account booleans→3 ลิสต์ suspended/downranked/notified), `disputes`/`rateRequests`/`ledger`/`rateOverrides` (1:1). เพิ่ม endpoint `GET /ledger`, `GET /rate-overrides`. API seed demo data (`services/demo.ts`, `npm run db:seed` = catalog+demo) ให้ตรง store seed — ยอด wallet ตรงกัน (platform=50).
- **slice 3 ✅ (write path)**: `StoreProvider` รับ prop `sync` (`true`=client จริง / inject `MutationSource` ในเทสต์) → ห่อ `dispatch` ให้ทำ local optimistic (reducer เดิม) **แล้ว mirror ไป API** (`mirror(action)`): adminCancelOrder→cancelOrder, resolveDispute, toggleSuspend→suspend/unsuspend, walletRunSettlement, approve/reject/counter/accept/decline rate. signature `dispatch` เท่าเดิม → หน้า/เทสต์ไม่ต้องแก้; api-off = dispatch ล้วน. `main.tsx` = `<StoreProvider persist hydrate sync>`. ตรวจ e2e: POST cancel 1041 → DB เป็น CancelledByAdmin + ledger 6→9. UI **57/57**.

**Auth ✅ (Lucia) — server + web**:
- **server**: `POST /auth/login` (actorId+password → scrypt verify → session cookie), `POST /auth/logout`, `GET /auth/me`. guard `requireUser`/`requireAdmin` (อ่าน session ผ่าน `readSession`). wire: `POST /disputes` ตัวตนผู้ร้อง = session.actorId + คู่กรณีจากออเดอร์ (ไม่เชื่อ body); moderation = แอดมินเท่านั้น. seed users 4 ราย (customer:aon/merchant:khao-man-kai/rider:somchai/admin:root, รหัส `demo1234`). e2e: 401/403/200 + dispute identity จาก session.
- **web**: `state.auth` + action `setAuth`; context เพิ่ม `login()`/`logout()` (backed by `AuthClient`, inject ได้ในเทสต์); เช็ค `me()` ตอน mount (เปิดเมื่อ hydrate/authClient). หน้า `/login` (ฟอร์ม + ปุ่มบัญชีเดโม) + แถบ `AuthBar` บนสุด (โชว์ผู้ใช้/ออกจากระบบ). `fileDispute` ใช้ `state.auth?.actorId ?? CUSTOMER_ID`. UI **60/60** (+3 login).

**create mutation adopt server id ✅ (submitRateRequest / place / fileDispute)**: dispatchWithSync จัดการ create แยก — optimistic ใส่ local id → ยิง API → ได้ entity (server UUID) → dispatch reconcile แทน local id → ops ทีหลังใช้ server id (ไม่ 404).
- **submitRateRequest** → `reconcileRateRequest`
- **place** → `POST /orders` (cart→order persist, คืน id) → `reconcileLiveOrder` ตั้ง `state.liveOrderId`
- **setOrder→Completed** → `POST /orders/:id/complete` (ดันสถานะฝั่ง server = ปลดล็อกร้องเรียน)
- **fileDispute** → `POST /disputes` ด้วย `liveOrderId` (ตัวตนผู้ร้องจาก session, คู่กรณีจากออเดอร์) → `reconcileDispute`

e2e: place→complete→login customer→fileDispute → dispute.customer จาก session, merchant/rider จากออเดอร์. UI **63/63**.

**menu CRUD ✅**: api `POST /restaurants/:id/menu` · `PUT /restaurants/:id/menu/:dishId` · `DELETE …` — ใช้ validation ชุดเดียวกับ web (โดเมน `addItem`/`updateItem`/`removeItem`) ผ่าน `applyMenu` (load dishes→fn→เขียนทับเมนูร้านใน transaction; 404 ไม่พบร้าน / 409 โดเมนปฏิเสธ). web mirror menuAddDish/Update/RemoveDish → endpoint (dish id เสถียร ไม่ต้อง adopt). e2e: add→GET เห็น→update→delete + validation 409/404. UI **64/64**.

**refetch/rollback ✅**: สกัด hydrate logic เป็น `rehydrate()` (useCallback) ใช้ทั้ง mount และตอน mutation ล้มเหลว — ทุก mirror error (`.catch(rollback)`) เรียก `rehydrate()` ดึง read จาก server ทับ optimistic = revert ให้ตรงความจริง (success ไม่ refetch → ไม่เพิ่มภาระ). เทสต์: suspend ล้มเหลว → getModeration ถูกเรียกซ้ำ → suspended กลับว่าง. UI **65/65**.

**merchant identity จาก session + gate menu CRUD ✅**: helper `merchantRestaurantId(state)` = ถ้าล็อกอินเป็น merchant → `actorId` ตัด `merchant:` ไม่งั้น fallback เดโม; หน้า MerchantMenu/MerchantRate ใช้แทน hardcode. api: menu CRUD ครอบ `requireMerchantOf` (admin หรือ merchant เจ้าของร้านนั้น). e2e: ไม่ล็อกอิน→401, customer→403, merchant ร้านอื่น→403, merchant เจ้าของ→200, admin→200. UI **66/66**.

**rider dispatch จริง ✅ (ADR 0001 pull-based)**: ออเดอร์สร้างแบบ **ไม่มีไรเดอร์** (place ไม่ส่ง rider); ไรเดอร์คว้างานผ่าน `POST /orders/:id/claim` (ตัวตนจาก session — rider role; โดเมน `claimJob` ตรวจพักงาน + ใครกดก่อนได้ก่อน → assign `riderId=session.actorId`). web: `riderActorId(state)` (session rider / fallback), Rider page claim → action `claimLive` → mirror `/claim` + ตั้ง `state.liveRider`. e2e: ไม่ล็อกอิน→401, customer→403, rider→Claimed+riderId, claim ซ้ำ→409, rider พักงาน→409. UI **67/67**.

**วงจรออเดอร์เต็ม persist ฝั่ง server ✅**: `POST /orders/:id/transition` {action} ครอบ transition ทั้งสอง rail — ราง ร้าน (accept/markReady/reject, auth=requireMerchantOf) + ราง ไรเดอร์ (arriveAtMerchant/pickup/arriveAtCustomer/confirmDelivery/declareFailed/release, auth=ไรเดอร์ที่ถือออเดอร์ riderId ตรง session). web: `setOrder` มี `txn?` (ชื่อ transition) — Merchant/Rider page ส่ง txn → mirror `/transition`; ไม่มี txn แต่ Completed (เดโม Track) → `/complete`. e2e: เดินครบ accept→ready→claim→arrive→pickup→arrive→confirm→**Completed** + auth ราง 403. UI **68/68**.

**UX แจ้งเมื่อ mirror ล้มเหลว ✅**: `state.notice` + แถบ `<Notice>` บนสุด (auto-dismiss 4 วิ / กดปิด) — mirror ล้ม (เช่น 401 "ต้องเข้าสู่ระบบก่อน", 403 "ไม่ใช่งานของคุณ") → ดึงข้อความจาก server มาโชว์ + rollback (refetch). UI **69/69**.

**🏁 store→API cutover + วงจรออเดอร์เต็ม — ครบสมบูรณ์** ✅ ทุก transition (ร้าน+ไรเดอร์) เดินผ่าน Postgres + auth ตามบทบาท + แจ้งผู้ใช้เมื่อล้มเหลว. fullstack จริงครบวงจร.

## หน้า Home / UX (ต่อ placeholder V1 ให้ใช้งานจริง)
- **ดูทั้งหมด / ร้านอาหารทั้งหมด** → หน้า `/all` (`AllRestaurants`) render จาก `state.restaurants` (ข้อมูล hydrate จาก API จริง — เดิม Home ใช้ array ฮาร์ดโค้ด)
- **ปักหมุดที่อยู่ + แผนที่จริง** → `components/LocationPicker` (Leaflet + OpenStreetMap): หมุดร้านจาก state + หมุดที่อยู่ลากได้/คลิกแผนที่ + presets → `setDeliveryLocation` ตั้ง `state.deliveryCoord`/`deliveryLabel`. ปุ่ม 📍 ซ้ายบน + "ดูแผนที่" เปิด picker. ที่อยู่นี้ feed `checkServiceability`/ค่าส่ง (haversine) ทุกหน้า (Home/Restaurant/Menu/Cart/All) → เปลี่ยนหมุดแล้ว "นอกพื้นที่"/ค่าส่งอัปเดตจริง
- **เลื่อนแถวร้านบนเดสก์ท็อป** → wheel แนวตั้งเหนือ `.hscroll` เลื่อนแนวนอน (handler ใน App) + scrollbar บางให้เห็น
- dep ใหม่: `leaflet` (+ @types) ใน root package.json; เพิ่ม react/react-dom/react-router-dom เข้า root deps ด้วย (กัน `npm install` ที่ root prune ทิ้ง)
> ตรวจแล้ว: typecheck + UI **71/71** + `vite build` ผ่าน (leaflet bundle ได้) — *แต่ผลเรนเดอร์แผนที่ยังไม่ได้ดูในเบราว์เซอร์จริง (Chrome extension ไม่เชื่อมต่อ)*

> เทสต์ UI: บน Windows worker-fork แบบขนานบาง crash (suite-load) — รัน `npm run test:ui -- --no-file-parallelism` เพื่อผลคงที่

## QA session (backend E2E + UI) — issues ที่ filed

รัน `/qa` ยิง fullstack จริง (login 3 role ถือ session แยก → เดินวงจร/สิทธิ์/dispute ผ่าน API). **ผ่าน**: happy-path lifecycle เต็ม (place→accept→ready→claim→arrive→pickup→arrive→confirm→Completed), access control ข้ามบทบาท/ข้ามร้าน (403 ครบ), suspended rider กัน claim (409), admin-only suspend, admin-cancel settlement (refund/payout+ledger), dispute file (401 ถ้าไม่ login) + goodwill double-entry. **filed 6 issues** (GitHub):
- **#2** API ล่มทั้ง process เมื่อ DB connection หลุด (pg-boss `57P01` unhandled → ควร reconnect/ดักจับ) — สูง
- **#3** browser tab title ค้าง "…ติดตามออเดอร์" ทุกหน้า (static `<title>` ใน index.html, ไม่อัปเดตต่อ route) — ต่ำ
- **#4** ออเดอร์ส่งสำเร็จ (confirmDelivery→Completed) **ไม่ post settlement ลง ledger** — ร้าน/ไรเดอร์ไม่ได้เงิน; มีแต่ `/cancel` (admin) ที่ post; terminal อื่น (FailedDelivery/RejectedByMerchant) ก็ไม่ post — สูง
- **#5** `/orders/:id/complete` และ `/cancel` **ไม่มี auth guard** — anonymous สั่ง complete/admin-cancel ออเดอร์ใครก็ได้ (ต่างจาก claim/transition/disputes ที่กั้นครบ) — สูง
- **#6** `POST /orders` ไม่ validate line → ขาด `options`=500 ตอนสร้าง / ขาด `basePrice`=NaN→เก็บ amount null แล้ว 500 ตอน settle — กลาง
- nit (ยังไม่ filed): ข้อความ 403 ของ `requireMerchantOf` เขียน "แก้ได้เฉพาะเมนูร้านของตัวเอง" แต่ใช้กับ transition ออเดอร์ด้วย (copy กำกวม)

**✅ แก้ #4 + #5 แล้ว** (`apps/api/src/routes/orders.ts`): helper `settleOrderToLedger(tx, orderId, restaurantId, amounts, state)` — เรียก `settle()` ถ้าถึงปลายทางแล้ว post เข้า ledger, **idempotent** (ข้ามถ้า orderId มีใน ledger แล้ว กันจ่ายซ้ำเมื่อถึง Completed ได้หลายเส้นทาง). wire เข้า `/transition` (ทุก terminal: confirmDelivery/declareFailed/reject), `/complete`, และ refactor `/cancel` มาใช้ helper เดียวกัน. **auth**: `/cancel`→`requireAdmin`, `/complete`→`requireUser`. e2e: ส่งสำเร็จ→ledger 3 รายการ (merchant/rider/platform) + /complete ซ้ำไม่เพิ่ม; anon complete/cancel→401, customer cancel→403, admin cancel→200. ⚠️ ผลข้างเคียง: web demo Track "complete" ตอนนี้ต้องล็อกอิน (ไม่งั้น 401→notice+rollback — พฤติกรรมที่ถูกต้อง). typecheck api ผ่าน. **commit `bc566d7`** → merge เข้า main; ปิด issue #4/#5 บน GitHub แล้ว.

**✅ แก้ #6 แล้ว** (`apps/api/src/routes/orders.ts`): เพิ่ม Fastify JSON schema validation ที่ route `POST /orders` — `lines` ต้อง minItems 1, แต่ละ line ต้องมี `id/itemName/basePrice(≥0)/qty(int≥1)`, `options` default `[]` (ขาดได้ไม่ crash), `spice/note` default `''`. input ไม่ครบ → Fastify คืน **400** เอง (ไม่ใช่ 500/null). e2e: ขาด basePrice/qty/lines ว่าง/option ขาด price/ใช้ field ผิด→400; ขาด options→200+food ถูก; admin-cancel ออเดอร์นั้น→200 (บั๊ก null amount หาย). typecheck ผ่าน.

**✅ แก้ #2 แล้ว** (`apps/api/src/jobs/settlement.ts`): เพิ่ม `boss.on('error', …)` — เดิม pg-boss ปล่อย event `'error'` (เช่น DB connection หลุด `57P01`) โดยไม่มี listener → EventEmitter throw จน process ตายทั้งตัว. ดักไว้แค่ log แล้วปล่อย pg-boss สร้าง connection ใหม่ตอน poll รอบถัดไป (กู้คืนเอง; main db เป็น postgres.js/porsager ซึ่ง reconnect ต่อ query อยู่แล้ว). verify: `docker restart fd-postgres` ระหว่าง api รัน → api **PID เดิม ไม่ crash** + `GET /restaurants`→200 (กู้คืน) + log จับ error `57P01` ได้จริง.

**✅ แก้ #3 แล้ว** (`apps/web/src/ui/App.tsx` + `index.html`): เดิม `<title>` ตายตัวใน index.html ทุกหน้าขึ้น "ติดตามออเดอร์". เพิ่ม `<DocumentTitle/>` (ใช้ `useLocation` + store) ตั้ง `document.title` ตาม route: หน้าแรก=แบรนด์ล้วน, หน้าคงที่ (ตะกร้า/คอนโซล/แอดมิน/ฯลฯ)="<ชื่อหน้า> · แบรนด์", `/r/:id`=ชื่อร้าน, `/r/:id/:dishId`=ชื่อเมนู·ชื่อร้าน (ดึงจาก catalog จริง). index.html title เริ่มต้น=แบรนด์ล้วน. เทสต์ `App.title.test.tsx` (+5: render App ตาม route เช็ค document.title) → UI **76/76**.

**🏁 QA batch ปิดครบ**: #1–#6 filed, #1/#2/#4/#5/#6 แก้+ปิด, **#3 แก้+ปิด** — ไม่เหลือ issue open.

## Design polish (customer flow — /animate + /critique)

**Feedback layer (micro-interactions)** [`ccb66b8`]: motion tokens ใน tokens.css (`--ease-out-quart/quint/expo`, `--dur-fast/·/slow` 130/200/320ms; ไม่ใช้ bounce/elastic; GPU transform/opacity/filter; reduced-motion ปิดด้วย global rule เดิม). Signature = cartbar **เด้งขึ้น** (`cartbarIn`) + ตัวเลขจำนวน **pop** (`countPop` ผ่าน `key={count}` remount ใน Home/Restaurant.tsx). รอบๆ เงียบ: ปุ่มกดยุบ (.btn scale .97), การ์ดร้าน hover-lift/press, ช่องค้นหา focus glow, ปุ่ม "+" เมนูโต/ยุบ, เครื่องหมายถูก scale-in, ปุ่มจำนวนกดยุบ.

**Critique fixes**: (1) **stats hero ให้จริง** — เดิมฮาร์ดโค้ด "เปิดอยู่ 23 ร้าน / ไรเดอร์ 12 คน" → `inZoneCount` (ร้าน serviceable จริงจากที่อยู่ที่ปักหมุด, reactive) + ตัดเลขไรเดอร์ปลอมทิ้ง. (2) **glow มีวินัย** — ลบ glow จาก `.btn--mango` (เดิมเรืองเกลื่อน Admin/Login); สงวน glow ให้ "ปุ่มร้อน = action หลักต่อหน้า" เท่านั้น (`.btn--chili` สั่งเลย/เพิ่มลงตะกร้า + cartbar + OrderTracker สถานะ live). typecheck + UI 76/76 ผ่าน.

## Responsive ทั้งแอป (CSS-first, มือถือ-first คงเดิม 100%)

เดิมทุกหน้า cap `max-width:560–600px` กลางจอ → บนเดสก์ท็อปเป็นกรอบมือถือลอยกลาง. เพิ่ม `@media` **tablet ≥768 / desktop ≥1024** เท่านั้น (ไม่แตะ markup/logic → IA เดียวกันทุก context, ไม่พัง test):
- **Home**: desktop container 1100px · แถว "เปิดอยู่ตอนนี้" กาง **grid** (`.stalls .hscroll`→grid auto-fill, เลิกพึ่ง horizontal scroll/wheel บนเดสก์ท็อป) · "ใกล้คุณ" 2→3 คอลัมน์ · search คุมกว้าง 600 · หมวดหมู่จัดกึ่งกลาง
- **AllRestaurants** grid 2→3 คอลัมน์ · **Restaurant** เมนู 2 คอลัมน์ (820/1000px) · **Menu** กว้างขึ้นคงโฟกัสกลาง (680/760)
- **Cart** desktop 2 คอลัมน์: รายการซ้าย / สรุปยอดขวา **sticky** (grid auto-flow dense; placebar คงติดล่าง)
- **Merchant/Rider** container 720px + ปุ่ม action ไม่ยืดเต็ม · **Admin** 1040px + `.a-orders`/`.a-disputes` 2 คอลัมน์
- แก้ใน CSS ต่อไฟล์เท่านั้น (Home/AllRestaurants/Restaurant/Menu/Cart/Merchant/Rider/Admin.css); Track คงเดิม (vertical flow). ตรวจ: typecheck clean + **test:ui 71/71** + vite เสิร์ฟไม่มี build error. *ผลภาพเดสก์ท็อปยังไม่ได้ screenshot ยืนยัน (Chrome ext debugger ถูกกั้น — localhost ยังไม่ approve); ขยายหน้าต่างเป็น 1440px ให้ผู้ใช้ eyeball แล้ว.* follow-up ถ้าต้องการ: master-detail จริงของ consoles (ต้องแก้ component/state).

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
    catalog/catalog.ts     ชนิด+seed ร้าน/เมนู + RATE_POLICY/ratesFor + findRestaurant/findDish (single source: web+api ใช้ร่วม)
apps/web/src/ui/           React web (อ้างโดเมนผ่าน @app/domain)
    data/catalog.ts        re-export shim จาก @app/domain/catalog (path import เดิมของหน้า UI ไม่ต้องแก้)
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
apps/api/src/              backend: server/db(schema+seed)/routes(catalog,orders,disputes,rate,moderation,settlement)/services/jobs/auth — ดู apps/api/README.md
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
