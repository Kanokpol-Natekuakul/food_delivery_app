# Food Delivery Marketplace (ตลาดเปิดเมื่อนั้น)

แพลตฟอร์ม Marketplace ส่งอาหารแบบ Full-stack ครบวงจรที่เชื่อมต่อ **4 บทบาท** (ลูกค้า, ร้านค้า, ไรเดอร์, และแอดมิน) เข้าด้วยกันในระบบเดียว ออกแบบด้วยหลัก **Domain-Driven Design (DDD)** โดยมี Core Logic เป็น Pure TypeScript และมี Backend เชื่อมโยงฐานข้อมูลจริง (Fastify + PostgreSQL)

---

## 🌟 ฟีเจอร์หลักแบ่งตามบทบาท (Key Features by Role)

| บทบาท (Role) | ความสามารถหลัก (Capabilities) |
|---|---|
| **ลูกค้า (Customer)** | ค้นหาและดูเมนูร้านค้า, เลือกตัวเลือกอาหาร (ระดับเผ็ด/ท็อปปิ้ง), ตะกร้าสินค้าแบบสั่งได้ทีละร้าน (Single-Restaurant Rule), คำนวณค่าส่งตามระยะทางจริง (Haversine), ตรวจสอบพื้นที่บริการ (Service Zone), สั่งอาหารและติดตามออเดอร์แบบ Real-time, ยื่นข้อร้องเรียนหลังส่ง (Dispute) พร้อมแนบรูปถ่าย |
| **ร้านค้า (Merchant)** | คอนโซลรับออเดอร์ (ตอบรับ/ปฏิเสธ/ทำเสร็จ), จัดการเมนูอาหาร (CRUD: เพิ่ม/แก้/ลบเมนู), เจรจาและยื่นขอลดอัตราค่าคอมมิชชัน (Commission Rate Negotiation) ร่วมกับแอดมิน |
| **ไรเดอร์ (Rider)** | หน้ากดรับงานจัดส่ง (Claim Job) แบบแย่งงานกันกด (First-Come-First-Served), ลำดับการมองเห็นงานก่อนไรเดอร์ที่ติดโทษ (Priority Window), โหมดจัดการงานจัดส่งแบบทีละขั้นตอน (ถึงร้าน -> รับอาหาร -> ส่งถึงลูกค้า -> ยืนยันรหัส OTP) |
| **ผู้ดูแล (Admin)** | แดชบอร์ดดูออเดอร์ทั้งหมดในระบบและรายละเอียดการเงินแยกตามออเดอร์, ยกเลิกออเดอร์ฉุกเฉิน (Force-cancel), สรุปบัญชีแยกส่วนแบ่งรายได้ (Revenue Split) เข้ากระเป๋า (Wallet) ของแต่ละฝ่าย, สั่งจ่ายเงินรอบโอนสะสม (Settlement Payout) ขั้นต่ำ ฿50, ตัดสินข้อร้องเรียน (Goodwill Refund / Reject), จัดการระงับบัญชี (Suspend) หรือลดลำดับ (Downrank) เมื่อฝ่าฝืนเกณฑ์ |

---

## 🛠️ สแต็กเทคโนโลยี (Tech Stack)

- **Frontend:** Vite + React (SPA), React Router, Leaflet + OpenStreetMap (จัดการแผนที่และตำแหน่งส่ง)
- **Backend:** Fastify (Node.js REST API), Drizzle ORM
- **Database:** PostgreSQL (รวมถึง `pg-boss` สำหรับจัดคิวงาน Background Cron/Settlement)
- **Auth:** Lucia Authentication (Session Cookies, Scrypt password hashing)
- **Testing:** Vitest + Testing Library + jsdom (ฝั่ง UI) & Node.js native `node:test` (ฝั่ง Domain)

---

## 🚀 ขั้นตอนการติดตั้งและการเริ่มใช้งาน (Setup & Quick Start)

### 1. ติดตั้ง Dependencies และรันเฉพาะ Frontend (โหมดจำลอง)
หากต้องการรันเฉพาะส่วนเว็บอย่างเดียวเพื่อพรีวิวหน้าจอ (ตัวเว็บจะจำลองการทำงานออฟไลน์และเก็บข้อมูลใน localStorage แทน):
```bash
# ติดตั้ง dependencies ทั้งหมดใน root directory
npm install

# รัน Vite Dev Server (เปิดเว็บที่ http://localhost:5173)
npm run dev

# รัน Unit Tests ของส่วน Domain และ UI
npm test            # รัน domain test (node:test)
npm run test:ui     # รัน UI test (vitest)
```

---

### 2. ติดตั้งและเริ่มใช้งานระบบ Full-stack เต็มตัว (Frontend + API Backend + Database)

ระบบ Full-stack จะเซฟข้อมูลจริงลงฐานข้อมูลและมีระบบสมาชิกสมบูรณ์แบบ โดยมีขั้นตอนการรันดังนี้:

#### **A) รัน PostgreSQL ผ่าน Docker**
เปิดใช้งานฐานข้อมูล PostgreSQL พอร์ต 5433 (แยกกับตัวฐานข้อมูลหลักในเครื่อง):
```bash
docker run -d --name fd-postgres \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_USER=devuser \
  -e POSTGRES_DB=food_delivery \
  -p 5433:5432 \
  postgres:16-alpine
```

#### **B) ตั้งค่าและเตรียมฐานข้อมูล (Migrate & Seed)**
1. สร้างไฟล์ `.env` ที่โฟลเดอร์ `apps/api/.env` เพื่อระบุ Path ไปฐานข้อมูล (หากยังไม่มี):
   ```env
   DATABASE_URL=postgres://devuser:devpass@localhost:5433/food_delivery
   ```
2. ดำเนินการสร้างตารางและใส่ข้อมูลจำลองเริ่มต้น (Seed):
   ```bash
   # 1. ติดตั้ง deps สำหรับโฟลเดอร์ API
   npm install --prefix apps/api

   # 2. ทำการสร้างตารางในฐานข้อมูล (Run migrations)
   npm run db:migrate --prefix apps/api

   # 3. ใส่ข้อมูลตั้งต้นของร้านค้า เมนูอาหาร และบัญชีผู้ทดสอบ (Run seed)
   npm run db:seed --prefix apps/api
   ```

#### **C) รัน Server และ Frontend ไปพร้อมกัน**
เปิด Terminal 2 หน้าเพื่อรันหลังบ้านและหน้าบ้านคู่กัน:
- **Terminal 1 (Backend API):**
  ```bash
  npm run dev --prefix apps/api
  # รันหลังบ้านที่ http://localhost:3001
  ```
- **Terminal 2 (Frontend UI):**
  ```bash
  npm run dev
  # รันหน้าบ้านที่ http://localhost:5173
  ```

---

## 🔑 บัญชีสำหรับการทดสอบ (Demo Credentials)
เมื่อเปิดรันระบบ Full-stack สามารถล็อกอินในหน้าเว็บด้วยบัญชีตัวอย่างดังต่อไปนี้ (รหัสผ่านใช้ร่วมกันคือ `demo1234`):

| บทบาท | Actor ID | คำอธิบายสิทธิ์ |
|---|---|---|
| **ลูกค้า (Customer)** | `aon` | สำหรับสั่งอาหารและกดส่ง Dispute แจ้งปัญหาหลังส่ง |
| **ร้านค้า (Merchant)** | `khao-man-kai` | สำหรับรับออเดอร์ จัดการเมนูอาหาร และขอเจรจาค่าคอม |
| **ไรเดอร์ (Rider)** | `somchai` | สำหรับกดเคลมงานส่งอาหาร และกดดำเนินสถานะการส่ง |
| **แอดมิน (Admin)** | `root` | สิทธิ์สูงสุด ควบคุมรอบเงิน จ่ายเงิน ระงับผู้ใช้ และตัดสินข้อพิพาท |

---

## 📁 โครงสร้างโปรเจกต์ (Project Directory Structure)

```
packages/domain/src/   # Core Business Logic (Pure TypeScript ปราศจาก dependency)
  ├── order/           # State machine ออเดอร์รางคู่ (merchant + rider) และตัวจับเวลา
  ├── cart/            # ตรรกะตะกร้าสินค้า (Single-restaurant rule)
  ├── delivery/        # การคำนวณระยะทาง Haversine ค่าส่ง และโซนให้บริการ
  ├── menu/            # CRUD เมนูอาหารและ Validation
  ├── settlement/      # การคิดบัญชีแยกจ่ายความรับผิดชอบเมื่อออเดอร์สิ้นสุด
  ├── wallet/          # บัญชีแยกประเภท Ledger และรอบการจ่ายเงินสะสม
  ├── moderation/      # ระบบระงับบัญชี (Suspend) และการจัดอันดับ
  ├── dispute/         # ระบบข้อร้องเรียนและเกณฑ์ตัดสิน auto-action
  └── catalog/         # Single source of truth ของร้านอาหารและราคาตั้งต้น

apps/web/src/          # React SPA Application (Vite)
  ├── ui/pages/        # หน้าจอหลักของ 4 บทบาท (Home, Track, Merchant, Admin, ฯลฯ)
  ├── ui/store.tsx     # State management (Reducer + Sync API + Queue ออฟไลน์)
  └── api/client.ts    # ฟังก์ชันเรียก API Backend ที่กำหนด Type ปลอดภัย

apps/api/src/          # Fastify API Server Backend
  ├── routes/          # REST Endpoints ควบคุม CRUD ออเดอร์ ข้อพิพาท และค่าคอม
  ├── db/              # schema และ migrations ของ Drizzle
  └── jobs/            # pg-boss cron สำหรับตรวจจ่ายยอดเงินอัติโนมัติ
```

---

## 📖 ลิงก์เอกสารอ้างอิงเพิ่มเติม
- **ภาพรวมโปรเจกต์แบบละเอียด:** [docs/overview.md](./docs/overview.md)
- **วงจรชีวิตสถานะออเดอร์ (Dual-track State Machine):** [docs/order-lifecycle.md](./docs/order-lifecycle.md)
- **พจนานุกรมศัพท์จำกัดความของโดเมน:** [CONTEXT.md](./CONTEXT.md)
- **การตัดสินใจด้านสถาปัตยกรรม (ADR):** [docs/adr/](./docs/adr/)
- **คู่มือหลังบ้านเพิ่มเติม:** [apps/api/README.md](./apps/api/README.md)
