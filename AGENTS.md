# Agent Handoff — Food Delivery Marketplace

คู่มือสำหรับ AI agent ทุกตัวที่เข้ามาทำงานต่อในโปรเจกต์นี้ อ่านไฟล์นี้ก่อนเริ่มงานเสมอ
(ภาพรวมโปรเจกต์ฉบับเต็มอยู่ใน [README.md](./README.md), ศัพท์โดเมนอยู่ใน [CONTEXT.md](./CONTEXT.md), การตัดสินใจเชิงสถาปัตยกรรมอยู่ใน [docs/adr/](./docs/adr/))

## โครงสร้าง

```
packages/domain/   โลจิกธุรกิจล้วน (pure TS, ห้ามมี dependency/I/O) — state machine, ค่าส่ง, wallet, dispute
apps/web/          Vite + React SPA — UI ทั้ง 4 บทบาท (ลูกค้า/ร้าน/ไรเดอร์/แอดมิน) เป็นภาษาไทย
apps/api/          Fastify + PostgreSQL (Drizzle) — ดู apps/api/README.md สำหรับการรัน backend เต็มระบบ
```

## คำสั่งหลัก

```bash
npm run dev          # dev server ที่ http://localhost:5173
npm test             # เทสต์ domain (node:test)
npm run test:ui      # เทสต์ UI (vitest + testing-library)
npm run typecheck    # tsc ทั้ง web + domain
npm run build        # production build
```

## ⚠️ ข้อควรระวังเฉพาะเครื่อง/โปรเจกต์นี้

- **เครื่องนี้แรมจำกัด** — `npm run test:ui` แบบเต็ม worker จะทำให้ vitest worker ตายแบบ out-of-memory และเทสต์ timeout แบบหลอก (false failure) ให้รันด้วย
  `npx vitest run --root apps/web --maxWorkers=2` เสมอ ถ้าเจอเทสต์ fail ที่เวลาเกิน timeout ไปนิดเดียวพร้อม "Worker exited unexpectedly" ให้สงสัยเรื่องนี้ก่อนสงสัยโค้ด
- **UI และเทสต์เป็นภาษาไทย** — เทสต์ assert ข้อความไทย เช่น `getByRole('button', { name: 'หยุดเวลา' })` เวลาแก้ label ใน UI ต้องแก้เทสต์ตาม
- **กฎธุรกิจทั้งหมดอยู่ใน `packages/domain/`** — ห้าม hardcode กฎ (เวลา timeout, ค่าธรรมเนียม, การเปลี่ยนสถานะ) ในฝั่ง UI ให้ import จาก domain เช่น `@app/domain/order/timers`

## สถาปัตยกรรมฝั่ง web ที่ต้องรู้

- `apps/web/src/ui/store.tsx` คือหัวใจ: `useReducer` + optimistic sync ไป API + **offline mutation queue** เก็บใน localStorage (ยิงซ้ำเมื่อกลับมาออนไลน์)
- **Dev state ใน store**: `state.mockOffline` (จำลองเน็ตหลุด — mutation จะเข้า queue แทน) และ `state.simSpeed` (ตัวคูณความเร็ว setInterval ใน Track.tsx / Rider.tsx)
- **DevPanel** (`ui/components/DevPanel.tsx`) — ปุ่มประแจมุมจอ: toggle mock offline + badge จำนวนรายการค้างซิงก์ + ปุ่มสปีดเวลา 1x/5x/15x/30x + diagnostics
- **PWA**: `public/manifest.json` + `public/sw.js` (cache-first สำหรับ asset) — SW ลงทะเบียนเฉพาะ production build (`import.meta.env.PROD` ใน main.tsx) จึงไม่รบกวน dev/เทสต์
- Order lifecycle เป็น **dual-track state machine** (ฝั่งร้าน + ฝั่งไรเดอร์ บรรจบกันตอน pickup) — ดู docs/order-lifecycle.md

## สถานะล่าสุด (2026-07-02)

- เทสต์ผ่านครบ: domain + UI 77/77, build production ผ่าน
- `main` ในเครื่องนำหน้า `origin/main` อยู่ 5 คอมมิต (ยังไม่ push — รอเจ้าของสั่ง)
- งานที่เพิ่งเสร็จ: ErrorBoundary, offline mutation queue, DevPanel (mock offline + sim speed), PWA manifest + SW

## งานที่รู้ว่าค้าง / ควรทำต่อ

- [ ] **PWA icon หาย**: `manifest.json` อ้าง `/favicon.ico` ซึ่งไม่มีไฟล์จริงใน `apps/web/public/` และยังไม่มีไอคอน PNG 192x192 + 512x512 ที่ Chrome/Android ต้องใช้ก่อนจะขึ้น install prompt
- [ ] พิจารณา fix `maxWorkers` ลงใน vitest config ถาวร แทนการพิมพ์ flag ทุกครั้ง
- [ ] push 5 คอมมิตขึ้น origin เมื่อเจ้าของยืนยัน
