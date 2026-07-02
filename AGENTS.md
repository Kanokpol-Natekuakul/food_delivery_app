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

- **เครื่องนี้แรมจำกัด** — vitest แบบเต็ม worker จะทำให้ fork ตายแบบ out-of-memory และเทสต์ timeout แบบหลอก (false failure) ตอนนี้ pin `maxWorkers: 2` ไว้ใน `apps/web/vite.config.ts` แล้ว (`npm run test:ui` ปลอดภัย) — **ห้ามลบ setting นี้** ถ้าเจอเทสต์ fail พร้อม "Worker exited unexpectedly" ให้สงสัยเรื่องแรมก่อนสงสัยโค้ด
- **UI และเทสต์เป็นภาษาไทย** — เทสต์ assert ข้อความไทย เช่น `getByRole('button', { name: 'หยุดเวลา' })` เวลาแก้ label ใน UI ต้องแก้เทสต์ตาม
- **กฎธุรกิจทั้งหมดอยู่ใน `packages/domain/`** — ห้าม hardcode กฎ (เวลา timeout, ค่าธรรมเนียม, การเปลี่ยนสถานะ) ในฝั่ง UI ให้ import จาก domain เช่น `@app/domain/order/timers`

## สถาปัตยกรรมฝั่ง web ที่ต้องรู้

- `apps/web/src/ui/store.tsx` คือหัวใจ: `useReducer` + optimistic sync ไป API + **offline mutation queue** เก็บใน localStorage (ยิงซ้ำเมื่อกลับมาออนไลน์)
- **Dev state ใน store**: `state.mockOffline` (จำลองเน็ตหลุด — mutation จะเข้า queue แทน) และ `state.simSpeed` (ตัวคูณความเร็ว setInterval ใน Track.tsx / Rider.tsx)
- **DevPanel** (`ui/components/DevPanel.tsx`) — ปุ่มประแจมุมจอ: toggle mock offline + badge จำนวนรายการค้างซิงก์ + ปุ่มสปีดเวลา 1x/5x/15x/30x + diagnostics
- **PWA**: `public/manifest.json` + `public/sw.js` (cache-first สำหรับ asset, precache ต้องชี้ไฟล์ที่มีจริงเท่านั้น — ไฟล์หายตัวเดียว = `cache.addAll` reject = SW ติดตั้งไม่สำเร็จทั้งตัว) — SW ลงทะเบียนเฉพาะ production build (`import.meta.env.PROD` ใน main.tsx) จึงไม่รบกวน dev/เทสต์ ไอคอนอยู่ `public/icons/` (192/512 PNG + favicon.png) วาดโดยสคริปต์ (พระจันทร์เสี้ยว mango บนพื้น ink ตาม tokens.css)
- Order lifecycle เป็น **dual-track state machine** (ฝั่งร้าน + ฝั่งไรเดอร์ บรรจบกันตอน pickup) — ดู docs/order-lifecycle.md

## สถานะล่าสุด (2026-07-02)

- เทสต์ผ่านครบ: domain + UI 77/77, build production ผ่าน
- `main` ในเครื่องนำหน้า `origin/main` อยู่ 5 คอมมิต (ยังไม่ push — รอเจ้าของสั่ง)
- งานที่เพิ่งเสร็จ: ErrorBoundary, offline mutation queue, DevPanel (mock offline + sim speed), PWA manifest + SW

## งานที่รู้ว่าค้าง / ควรทำต่อ

- [ ] push คอมมิตค้างขึ้น origin เมื่อเจ้าของยืนยัน
- [ ] พิจารณาตั้ง GitHub Actions CI (typecheck + domain test + UI test)
