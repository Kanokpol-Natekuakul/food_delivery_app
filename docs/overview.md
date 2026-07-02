# ภาพรวมโปรเจกต์ — Food Delivery Marketplace

แพลตฟอร์ม marketplace ส่งอาหารแบบ fullstack ที่เชื่อม 4 บทบาท — ลูกค้า, ร้านค้า, ไรเดอร์ และแอดมิน — เข้าด้วยกันในระบบเดียว
ออกแบบด้วยหลัก domain-driven design โดยแยก business logic ทั้งหมดเป็น pure TypeScript ไม่ผูกกับ framework ใดๆ

## สถาปัตยกรรม (Architecture)

โปรเจกต์ใช้โครงสร้าง **monorepo** แบ่งเป็น 3 ส่วนหลัก:

```
packages/domain/   โลจิกธุรกิจล้วน (pure TS, zero dependencies, ไม่มี I/O)
apps/web/          Vite + React SPA — UI ทั้ง 4 บทบาท (ข้อความภาษาไทยทั้งหมด)
apps/api/          Fastify + PostgreSQL (Drizzle ORM) — REST backend
```

- **Domain-driven**: กฎทุกข้อ (state machine, ค่าส่ง, settlement, wallet, dispute, moderation) อยู่ใน `packages/domain/` เท่านั้น — web import ผ่าน path alias `@app/domain`, API ใช้สำหรับ validation และ orchestration
- **Single source of truth**: ข้อมูลร้าน+เมนูอยู่ที่ `catalog.ts` — web ใช้เป็น reference data, API seed ลง database จากข้อมูลชุดเดียวกัน
- **Optimistic sync**: web dispatch action แบบ local-first (UI อัปเดตทันที) แล้ว mirror ไป API เบื้องหลัง — ล้มเหลวจะ refetch จาก server เพื่อ rollback

## สแต็กเทคโนโลยี (Tech Stack)

| เลเยอร์ | เทคโนโลยี |
|---|---|
| **Frontend** | Vite + React (SPA), React Router, Leaflet + OpenStreetMap |
| **Backend** | Fastify, PostgreSQL, Drizzle ORM |
| **Auth** | Lucia (session cookies, scrypt hashing) |
| **Background jobs** | pg-boss (cron scheduling สำหรับ settlement) |
| **Domain** | Pure TypeScript (ไม่มี dependency) |
| **Testing (domain)** | `node:test` (built-in Node.js test runner) |
| **Testing (UI)** | Vitest + Testing Library + jsdom |
| **Language** | TypeScript ทั้งโปรเจกต์ |

## ฟีเจอร์หลัก (Features)

### ลูกค้า (Customer)

- ค้นหาและเรียกดูร้านอาหาร (กรองตามชื่อ, หมวดหมู่)
- ดูเมนูพร้อมตัวเลือก (option groups: ระดับเผ็ด, ท็อปปิ้ง ฯลฯ)
- ตะกร้าที่ผูกกับร้านเดียว (single-restaurant rule) — สั่งข้ามร้านจะถามยืนยันก่อนล้าง
- คำนวณค่าส่งจากระยะทาง haversine (฿15 + ฿7/กม.)
- ตรวจ Service Zone (รัศมี 6 กม.) — ร้านนอกเขตจะถูกปิดกั้นการสั่ง 3 ชั้น
- ปักหมุดที่อยู่จัดส่งบนแผนที่ Leaflet (ลากหมุด/คลิก/presets)
- สั่งอาหารและติดตามออเดอร์แบบ real-time (dual-track state machine)
- ร้องเรียนหลังส่ง (dispute) ภายในหน้าต่าง 2 ชั่วโมง พร้อมแนบรูป

### ร้านค้า (Merchant)

- คอนโซลรับออเดอร์: ดูรายละเอียด → รับ / ปฏิเสธ / แจ้งอาหารเสร็จ
- จัดการเมนู (CRUD): เพิ่ม/แก้ไข/ลบรายการเมนูพร้อม validation จากโดเมน
- เจรจาอัตราคอมมิชชันกับแอดมิน (เสนอลดอัตรา → แอดมินอนุมัติ/เสนอแย้ง/ปฏิเสธ)

### ไรเดอร์ (Rider)

- คว้างาน (claim) แบบ pull-based / first-come-first-served
- ขั้นตอนจัดส่ง: คว้างาน → ถึงร้าน → รับอาหาร → ถึงลูกค้า → ยืนยัน OTP
- ไรเดอร์ที่ไม่ถูก downrank จะเห็นงานก่อน (priority window)
- ไรเดอร์ที่ถูกระงับ (suspended) จะถูกบล็อกไม่ให้คว้างาน

### แอดมิน (Admin)

- แดชบอร์ดหลายออเดอร์พร้อมสรุปการเงินต่อออเดอร์
- Settlement + revenue split (แตกยอดร้าน/ไรเดอร์/แพลตฟอร์ม)
- Wallet + payout (ยอดขั้นต่ำ ฿50) + settlement schedule อัตโนมัติ (daily/weekly)
- Force-cancel ออเดอร์ที่ยังดำเนินอยู่
- กำกับดูแล: ระงับ (suspend) / ลดอันดับ (downrank) / แจ้งเตือน (notify) ร้าน+ไรเดอร์
- แก้ไขร้องเรียน: คืนเงิน goodwill (แพลตฟอร์มแบก) หรือปฏิเสธ
- Auto-action ขั้นบันได: watch → notify, action → notify+downrank+suspend
- อนุมัติ/เสนอแย้ง/ปฏิเสธคำขอลดอัตราคอมมิชชัน

## วงจรชีวิตออเดอร์ (Order Lifecycle)

ออเดอร์ใช้ **dual-track state machine** — รางร้าน (merchant track) และรางไรเดอร์ (rider track) ทำงานอิสระจากกัน แล้วบรรจบกันที่จุด **pickup** (ไรเดอร์รับอาหารได้ก็ต่อเมื่ออาหารเสร็จ):

- **รางร้าน**: Placed → Accepted → Cooking → Ready (หรือ Rejected)
- **รางไรเดอร์**: Unclaimed → Claimed → ArrivedAtMerchant → PickedUp → ArrivedAtCustomer → Completed (หรือ FailedDelivery)

Terminal states: `Completed`, `FailedDelivery`, `RejectedByMerchant`, `CancelledByCustomer`, `CancelledByAdmin`, `DeliveryTimeout`

→ รายละเอียดเต็มอยู่ใน [order-lifecycle.md](./order-lifecycle.md)

## ระบบการเงิน (Financial System)

### Revenue Split

ยอดที่ลูกค้าจ่าย = ค่าอาหาร + ค่าส่ง + ค่าบริการ — แพลตฟอร์มทำรายได้จาก 3 ทาง:

| ส่วน | ค่าตั้งต้น | ผู้รับ |
|---|---|---|
| คอมมิชชัน (จากค่าอาหาร) | 30% | แพลตฟอร์ม |
| ส่วนแบ่งค่าส่ง | 20% | แพลตฟอร์ม |
| ค่าบริการ | ตามที่กำหนด | แพลตฟอร์ม |

อัตราสามารถกำหนดแบบ **ต่อร้าน** หรือ **ต่อโซน** ได้ (ลำดับ: ร้าน > โซน > base) ผ่านระบบเจรจาอัตราคอมมิชชัน

### Wallet & Settlement

- **Wallet** เป็น ledger ภายใน (append-only) — ออเดอร์จบสำเร็จ → เครดิตเข้า wallet ร้าน/ไรเดอร์/แพลตฟอร์ม
- **Payout** ถอนเงินออกเมื่อยอดสะสมถึงขั้นต่ำ ฿50
- **Settlement schedule** รันรอบจ่ายเงินอัตโนมัติ (daily หรือ weekly) — จ่ายทุกบัญชีที่ถึงเกณฑ์
- Settlement ลง ledger สำหรับทุก terminal state (Completed, FailedDelivery, Rejected, Cancelled) — idempotent ป้องกันจ่ายซ้ำ

## ระบบ Auth

ใช้ **Lucia** สำหรับ session-based authentication (scrypt hashing, session cookies):

| Actor ID | บทบาท | รหัสผ่าน |
|---|---|---|
| `aon` | ลูกค้า (Customer) | `demo1234` |
| `khao-man-kai` | ร้านค้า (Merchant) | `demo1234` |
| `somchai` | ไรเดอร์ (Rider) | `demo1234` |
| `root` | แอดมิน (Admin) | `demo1234` |

- Role-based access control: แต่ละ endpoint ตรวจสิทธิ์ตามบทบาท (เช่น merchant แก้ได้เฉพาะเมนูร้านตัวเอง, rider claim ได้เฉพาะเมื่อไม่ถูกระงับ)
- หน้า `/login` มีฟอร์ม + ปุ่มเลือกบัญชีเดโม, แถบ `AuthBar` บนสุดโชว์ตัวตน

## Optimistic Sync + Offline

- **Local-first dispatch**: ทุก action อัปเดต UI ทันที (reducer ฝั่ง client) แล้ว mirror ไป API เบื้องหลัง
- **Refetch on failure**: mirror ล้มเหลว → rehydrate ข้อมูลจาก server ทับ optimistic state (rollback)
- **Offline mutation queue**: เมื่อเน็ตหลุด mutation จะถูกเก็บใน localStorage — ยิงซ้ำเมื่อกลับมาออนไลน์
- **DevPanel** (ปุ่มประแจมุมจอ): toggle mock offline + badge จำนวนรายการค้างซิงก์ + ปุ่มปรับความเร็วเวลาจำลอง (1×/5×/15×/30×) + diagnostics
- **Notice bar**: แถบแจ้งผู้ใช้อัตโนมัติเมื่อ mirror ล้ม (เช่น 401 "ต้องเข้าสู่ระบบก่อน") — auto-dismiss 4 วินาที

## PWA

- **Manifest**: `public/manifest.json` พร้อมไอคอน `public/icons/` (192/512 PNG + favicon)
- **Service Worker**: `public/sw.js` ใช้ cache-first strategy สำหรับ asset — ลงทะเบียนเฉพาะ production build (`import.meta.env.PROD`) จึงไม่รบกวน dev/test
- รองรับการติดตั้งเป็นแอปบนมือถือและเดสก์ท็อป

## การรันโปรเจกต์ (Getting Started)

```bash
npm install            # ติดตั้ง dependencies
npm run dev            # dev server ที่ http://localhost:5173
npm test               # เทสต์ domain (node:test)
npm run test:ui        # เทสต์ UI (Vitest + Testing Library)
npm run typecheck      # tsc ทั้ง web + domain
npm run build          # production build
```

สำหรับการรัน backend เต็มระบบ (Fastify + PostgreSQL ใน Docker) ดูที่ [apps/api/README.md](../apps/api/README.md)

## โครงสร้างไฟล์ (File Structure)

```
packages/domain/src/
├── order/              State machine 2 ราง + transitions + timers + merchantView + riderView
├── cart/               ตะกร้า (single-restaurant rule, คิดราคา)
├── delivery/           ระยะ haversine, ค่าส่ง, Service Zone
├── menu/               CRUD เมนู + validation
├── settlement/         สรุปยอด/ความรับผิดต่อออเดอร์
├── wallet/             Ledger ภายใน (escrow → payout, settlement schedule)
├── moderation/         ระงับ/ลดอันดับ ผู้ใช้
├── dispute/            ร้องเรียนหลังส่ง + สถิติ + auto-action
├── revenue/            Revenue split + อัตราต่อร้าน/โซน + เจรจาอัตราคอม
└── catalog/            ข้อมูลร้าน+เมนู (single source of truth)

apps/web/src/
├── ui/
│   ├── pages/          Home, AllRestaurants, Restaurant, Menu, Cart, Track,
│   │                   Merchant, MerchantMenu, MerchantRate, Rider, Admin, Login
│   ├── components/     LocationPicker, OrderTracker, DevPanel, ErrorBoundary, Icons
│   ├── store.tsx       Global state (useReducer + persist + optimistic sync + offline queue)
│   ├── App.tsx         Router + AuthBar + Notice + LoadingBar + DocumentTitle
│   └── order/          orderView.ts (view-model), OrderTracker.tsx
├── api/client.ts       Typed fetch client ผูกทุก route (seam สลับ store ↔ backend)
├── test/               โครงเทสต์: setup.ts (jest-dom) + render.tsx (provider wrapper)
└── data/catalog.ts     Re-export shim จาก @app/domain/catalog

apps/api/src/
├── routes/             REST endpoints (catalog, orders, disputes, rate, moderation, settlement)
├── db/                 Drizzle schema + migrations + seed (catalog + demo data)
├── services/           Auth (Lucia), demo data
├── jobs/               Background jobs (pg-boss settlement cron)
└── auth/               Session management, guards (requireUser, requireAdmin, requireMerchantOf)
```

## เส้นทาง (Routes)

| Path | หน้า | บทบาท |
|---|---|---|
| `/` | หน้าแรก (ตลาด) — ค้นหา, หมวดหมู่, ลิสต์ร้าน | ลูกค้า |
| `/all` | ร้านอาหารทั้งหมด | ลูกค้า |
| `/r/:restaurantId` | หน้าร้าน + ลิสต์เมนู | ลูกค้า |
| `/r/:restaurantId/:dishId` | ปรับแต่งเมนู (ตัวเลือก, จำนวน) | ลูกค้า |
| `/cart` | ตะกร้า + สรุปราคา + ค่าส่ง | ลูกค้า |
| `/track` | ติดตามออเดอร์ (dual-track + แผงเดโม) | ลูกค้า |
| `/merchant` | คอนโซลรับออเดอร์ | ร้านค้า |
| `/merchant/menu` | จัดการเมนูร้าน (เพิ่ม/แก้/ลบ) | ร้านค้า |
| `/merchant/rate` | ดู/เจรจาอัตราคอมมิชชัน | ร้านค้า |
| `/rider` | คอนโซลไรเดอร์ (คว้างาน → รับ → ส่ง) | ไรเดอร์ |
| `/admin` | ผู้ดูแล: ออเดอร์ + settlement + กำกับดูแล + ร้องเรียน + อัตราคอม | แอดมิน |
| `/login` | เข้าสู่ระบบ (ฟอร์ม + ปุ่มบัญชีเดโม) | ทุกบทบาท |

## เอกสารที่เกี่ยวข้อง

- [README.md](../README.md) — ภาพรวมกระชับ (ภาษาอังกฤษ)
- [CONTEXT.md](../CONTEXT.md) — ศัพท์โดเมนและนิยาม (ubiquitous language)
- [order-lifecycle.md](./order-lifecycle.md) — วงจรชีวิตออเดอร์ (dual-track state machine)
- [docs/adr/](./adr/) — Architecture Decision Records (ADR 0001–0007)
- [apps/api/README.md](../apps/api/README.md) — คู่มือรัน backend (Fastify + PostgreSQL + Docker)
