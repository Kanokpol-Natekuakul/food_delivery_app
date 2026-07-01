---
name: Food Delivery Marketplace
description: ธีมตลาดกลางคืน — พื้นค่ำอมม่วง, แสงป้ายไฟมะม่วง/พริก/ใบเตย, รับใช้งาน 4 ฝ่ายโดยไม่ขวางทาง
colors:
  ink: "#16101C"
  ink-card: "#221829"
  ink-line: "#34273E"
  mango: "#FFB627"
  chili: "#FF4D3D"
  pandan: "#57B368"
  paper: "#F4ECE0"
  paper-dim: "#9C8FA6"
typography:
  display:
    fontFamily: "Kanit, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 9vw, 3.8rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Kanit, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  data:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "10px"
  md: "16px"
  pill: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
  sp-7: "48px"
  sp-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.chili}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 20px"
  button-mango:
    backgroundColor: "{colors.mango}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 20px"
  button-ghost:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "13px 20px"
  chip:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  search-input:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  card-row:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12px"
  cartbar:
    backgroundColor: "{colors.chili}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 24px"
---

# Design System: Food Delivery Marketplace

## 1. Overview

**Creative North Star: "แสงป้ายไฟตลาดกลางคืน (The Night Market Neon)"**

ระบบนี้คือ *ซอยสตรีทฟู้ดไทยยามค่ำ* ที่ถูกย่อลงในหน้าจอ — พื้นหลังคือความมืดอุ่นอมม่วงของกลางคืน, และสิ่งที่ "ติดไฟ" คือป้ายร้าน (มะม่วง), เตาที่กำลังร้อน (พริก), และของสดที่พร้อมเสิร์ฟ (ใบเตย). ความอบอุ่นและมีชีวิตชีวามาจาก *แสงที่เรืองออกจากความมืด* ไม่ใช่จากพื้นสว่างจ้า. นี่คือเปลือกที่ทำให้จำได้ทันทีว่าไม่ใช่แอปส่งอาหารเจ้าไหน.

แต่ระบบนี้เป็น **product** — เมื่อผู้ใช้ลงมือทำงานจริง (สั่งของตอนหิว, รับออเดอร์ระหว่างครัวยุ่ง, คว้างานกลางถนน, ตัดสิน settlement) ป้ายไฟต้องหลบให้งานลื่น. ดังนั้นแสงเรือง (glow) จึงถูกสงวนไว้อย่างมีวินัย: **หนึ่งการกระทำหลักต่อหนึ่งหน้า** เท่านั้นที่ติดไฟ — ที่เหลือเงียบ. ความหนาแน่นปรับตามฝ่าย: หน้าลูกค้าโปร่งและเชิญชวน, คอนโซลร้าน/ไรเดอร์/แอดมินแน่นและเน้นข้อมูล (ใช้ mono font กับตัวเลขทุกที่).

ระบบนี้ปฏิเสธชัดเจน: **look แอปส่งอาหารทั่วไป** (พื้นขาวจ้า ส้มสด การ์ดเหมือนกันจนจำไม่ได้), **SaaS dashboard เทมเพลต** (hero-metric การ์ดใหญ่, eyebrow ตัวเล็กทุก section, gradient text), และ **ความหรูเย็นชาแบบคอร์ปอเรต** ที่ไม่เหลือกลิ่นสตรีทฟู้ด.

**Key Characteristics:**
- พื้นค่ำอมม่วงอุ่น (`--ink #16101C`) เป็นผืนเดียวตลอดทั้งแอป — ไม่มีโหมดสว่าง
- accent สามสี = ป้ายไฟสามชนิด: มะม่วง (ไฮไลต์), พริก (action ร้อน), ใบเตย (พร้อม/สำเร็จ)
- แสงเรือง (glow) เป็น signature — แต่ปรากฏเฉพาะ "ปุ่มร้อนหลัก" ต่อหน้า
- ตัวเลข/ข้อมูลใช้ mono font (Space Mono) เสมอ — ราคา ค่าส่ง เปอร์เซ็นต์ อัตรา
- ไทยเป็นหลัก: ลำดับชั้นแยกด้วยน้ำหนัก+สี ไม่ใช่ uppercase

## 2. Colors

พาเลตต์คือ "ความมืดอุ่นหนึ่งผืน + แสงป้ายไฟสามดวง" — พื้นเป็นกลาง สงบ, สีทั้งหมดของพลังงานมาจาก accent ที่ใช้อย่างประหยัด.

### Primary
- **แสงป้ายไฟมะม่วง / Signage Amber** (`#FFB627`): สีไฮไลต์และ display — ชื่อแบรนด์เรืองแสง, ตัวเลขเด่น (อัตรา/เรตติ้ง), ป้ายสถานะ, ลิงก์ "ดูทั้งหมด", focus outline. เป็นสีที่ "ติดป้าย" ไม่ใช่สีปุ่มลงมือทำ.
- **ไฟเตาพริก / Chili Heat** (`#FF4D3D`): สี action ร้อนและด่วน — ปุ่มหลัก "สั่งเลย/เพิ่มลงตะกร้า", แถบตะกร้า (cartbar), ป้าย "ปิด/นอกเขต", สถานะ live. นี่คือสีที่บอกว่า *กดตรงนี้* หรือ *เรื่องด่วน*.

### Secondary
- **ใบเตยสด / Fresh Pandan** (`#57B368`): สีของ "พร้อม / สด / สำเร็จ" — จุด "เปิดอยู่" กะพริบ, ป้ายเขียวสถานะพร้อม, ผลลัพธ์สำเร็จ. ใช้เป็นสัญญาณเชิงบวก ไม่ใช่ปุ่ม.

### Neutral
- **พื้นค่ำ / Warm Ink** (`#16101C`): พื้นหลังหลักทั้งแอป — ดำอมม่วงอุ่น ไม่ใช่ดำสนิท. มี radial glow มะม่วง/พริกจางๆ อบอยู่ที่มุมบน (fixed) ให้รู้สึกเหมือนไอแสงแผงลอย.
- **พื้นการ์ด / Ink Card** (`#221829`): พื้นของการ์ดร้าน/แผง/ช่องค้นหา/ปุ่ม ghost — ยกจากพื้นด้วย *โทน* ไม่ใช่เงา.
- **เส้นขอบ / Ink Line** (`#34273E`): ขอบการ์ด, เส้นแบ่ง, ขอบ input — บางเสมอ (1px).
- **ตัวอักษรหลัก / Warm Paper** (`#F4ECE0`): ขาวอุ่น (ไม่ใช่ขาวจ้า) สำหรับ body/heading บนพื้นค่ำ.
- **ตัวอักษรรอง / Dim Paper** (`#9C8FA6`): ม่วงหม่น สำหรับข้อความรอง/meta/placeholder.

### Named Rules
**The One Sign Rule (กฎป้ายเดียว).** มีเพียง "action หลักหนึ่งเดียวต่อหน้า" ที่ได้ติดไฟพริก (`--glow-chili`). ปุ่มมะม่วง (รอง/ไฮไลต์ เช่น อนุมัติ/เข้าสู่ระบบ) เป็น**สีล้วน ไม่เรือง**. glow ที่ปรากฏบนทุกปุ่ม = ป้ายไฟรกจนไม่มีป้ายไหนเด่น — ต้องห้าม.

**The Mono-Number Rule (กฎตัวเลข mono).** ตัวเลขทุกตัวที่เป็นข้อมูล (ราคา ฿, ค่าส่ง, %, อัตรา, ระยะทาง, เวลา) ต้องใช้ Space Mono เสมอ. ตัวเลขในเนื้อความปกติใช้ฟอนต์ body ได้ แต่ "ข้อมูลตัวเลข" = mono.

## 3. Typography

**Display Font:** Kanit (fallback: system-ui, sans-serif) — น้ำหนัก 600/700/800
**Body Font:** Anuphan (fallback: system-ui, sans-serif) — น้ำหนัก 400/500/600
**Label/Mono Font:** Space Mono (fallback: ui-monospace, monospace) — 400/700

**Character:** Kanit คือ geometric sans ไทยที่หนาแน่นมีพลัง — ใช้เป็น "ป้ายร้าน" (display/heading). Anuphan คือ humanist sans ไทยที่อ่านสบายในระยะยาว — ใช้เป็น "เนื้อความ/UI". คู่นี้ contrast กันบนแกน geometric×humanist (ไม่ใช่ sans สองตัวที่คล้ายกัน). Space Mono เพิ่มมิติ "เครื่องคิดเลข/ใบเสร็จ" ให้ตัวเลขดูเป็นข้อมูลจริง.

### Hierarchy
- **Display** (Kanit 800, `clamp(2.4rem, 9vw, 3.8rem)`, lh 1.02, ls -0.01em): ป้ายไฟชื่อแบรนด์บน Home เท่านั้น — บรรทัดที่สองเรืองแสงมะม่วง (`text-shadow` สามชั้น).
- **Headline** (Kanit 700, `1.75rem`): หัวข้อ section ("เปิดอยู่ตอนนี้", "ใกล้คุณ").
- **Title** (Anuphan 600, `1.125rem`): ชื่อร้าน/เมนู/หัวการ์ด.
- **Body** (Anuphan 400, `1rem`, lh 1.55): เนื้อความทั่วไป. จำกัดความกว้างบรรทัดที่ 65–75ch เมื่อเป็นข้อความยาว.
- **Label** (Anuphan 500, `0.8125rem`): eyebrow/meta/ป้ายกำกับ — แยกด้วยน้ำหนัก+สี paper-dim ไม่ใช่ตัวพิมพ์ใหญ่.
- **Data** (Space Mono 400, `0.9375rem`): ตัวเลขข้อมูลทั้งหมด.

### Named Rules
**The No-Uppercase-Eyebrow Rule (กฎไม่ใช้ eyebrow ตัวใหญ่).** ภาษาไทยไม่มีตัวพิมพ์ใหญ่ — ห้ามเลียนแบบ eyebrow แบบ `text-transform: uppercase` + letter-spacing กว้างจากดีไซน์ฝรั่ง. แยกลำดับชั้นด้วย**น้ำหนักและสี** (label = Anuphan 500 สี paper-dim). ใช้ eyebrow เป็น grammar ทุก section = AI slop.

## 4. Elevation

ระบบนี้ **แบนเป็นค่าเริ่มต้น (flat-by-default)** — ความลึกมาจาก *โทนสี* (ink → ink-card ยกด้วยความสว่างที่ต่างกัน) และ *เส้นขอบบาง 1px* (ink-line) ไม่ใช่เงาดรอปทั่วไป. เงาที่มีในระบบไม่ใช่เงาเชิงพื้นที่ แต่เป็น **แสงเรือง (glow)** ซึ่งเป็นภาษาของ "ป้ายไฟติด" ไม่ใช่ "วัตถุลอย".

### Shadow Vocabulary
- **glow-mango** (`box-shadow: 0 0 28px rgba(255,182,39,.40)`): เรืองรอบองค์ประกอบไฮไลต์มะม่วง (สงวน — ปัจจุบันแทบไม่ใช้บนปุ่มเพื่อกัน glow เกลื่อน).
- **glow-chili** (`box-shadow: 0 0 26px rgba(255,77,61,.45)`): เรืองใต้ปุ่มร้อนหลัก/cartbar/สถานะ live — signature หลักของระบบ.
- **glow-pandan** (`box-shadow: 0 0 24px rgba(87,179,104,.40)`): เรืองใต้จุดสถานะ "เปิดอยู่/พร้อม".

### Named Rules
**The Glow-Is-Not-Shadow Rule.** แสงเรืองบอก "สิ่งนี้ติดไฟ/มีพลังงาน" ไม่ใช่ "สิ่งนี้ลอยเหนือพื้น". ห้ามใช้เงาดำดรอป (`0  Y blur rgba(0,0,0,...)`) เพื่อทำการ์ดลอยแบบ Material — การ์ดยกด้วยโทน+ขอบเท่านั้น. ถ้าอยากได้ความลึก ให้ปรับ ink-card ให้สว่างขึ้น ไม่ใช่เพิ่มเงา.

## 5. Components

### Buttons
- **Shape:** มุมโค้งนุ่ม 10px (`--r-sm`), padding `13px 20px`. กดแล้วยุบ `scale(.97)` (tactile), hover สว่างขึ้น `brightness(1.06)` — transition ด้วย ease-out-quart.
- **Primary (`.btn--chili`):** พื้นพริก `#FF4D3D` ตัวอักษรสี ink — action หลักต่อหน้า, **ตัวเดียวที่ได้ glow-chili**.
- **Highlight (`.btn--mango`):** พื้นมะม่วง `#FFB627` ตัวอักษรสี ink — action รอง/ยืนยัน (อนุมัติ/เข้าสู่ระบบ), **สีล้วน ไม่เรือง**.
- **Ghost (`.btn--ghost`):** พื้น ink-card ตัวอักษร paper ขอบ ink-line — action รองลงมา/ยกเลิก.

### Chips
- **Style:** พื้น ink-card ตัวอักษร paper ขอบ ink-line 1px, ทรง pill (`--r-pill`), padding `8px 14px`.
- **Variants:** `.chip--mango` (พื้นมะม่วงจาง 8% ขอบมะม่วง 30% — หมวด/ตัวกรอง active), `.chip--pandan` (เขียวจาง — สถานะพร้อม). กดแล้วยุบ `scale(.96)`.

### Cards / Containers
- **Corner Style:** 16px (`--r`) สำหรับการ์ดร้าน/แผง; 10px สำหรับ thumb เล็ก.
- **Background:** ink-card `#221829` บนพื้น ink.
- **Shadow Strategy:** ไม่มีเงา (ดู Elevation) — ยกด้วยโทน + ขอบ ink-line 1px.
- **Internal Padding:** `--sp-3` (12px) ถึง `--sp-4` (16px).
- **Behavior:** hover ยกตัว `translateY(-2px)`, กดยุบ `scale(.99)`.

### Inputs / Fields
- **Style:** พื้น ink-card ขอบ ink-line 1px, มุม 16px, padding `14px 16px`, ตัวอักษร paper, placeholder สี paper-dim.
- **Focus:** ไม่มี outline ปกติ — ใช้ **แสงเรืองขอบมะม่วงจาง** แทน (`box-shadow: 0 0 0 3px rgba(255,182,39,.14)` บน `:focus-within`). องค์ประกอบโต้ตอบอื่นใช้ `:focus-visible` outline มะม่วง 2px.

### Navigation
- **Drawer (hamburger):** สไลด์จากขวา พื้น ink-card ขอบซ้าย ink-line, ลิงก์เรียงตั้งมีเส้นคั่น ink-line, hover พื้น ink. avatar วงกลม, badge ตัวเลข mono พื้นมะม่วง. เข้า/ออกด้วย animation (เคารพ reduced-motion).
- **AuthBar (แถบบนสุด):** แสดงผู้ใช้ + ปุ่มออกจากระบบ, ลิงก์สีมะม่วง.

### Signature: ป้ายไฟแบรนด์ (Neon Sign) + Cartbar
- **ป้ายไฟแบรนด์:** heading display บน Home บรรทัดสองสีมะม่วง + `text-shadow` สามชั้น (4/16/34px) เลียนหลอดนีออน + animation `flickerOn` ตอนโหลด (กะพริบติดเหมือนป้ายไฟจริง, ปิดเมื่อ reduced-motion).
- **Cartbar:** แถบตะกร้าลอยติดล่างกลางจอ พื้นพริก + glow-chili, **เด้งขึ้น** `cartbarIn` (ease-out-expo) เมื่อมีของ, ตัวเลขจำนวน **pop** `countPop` ตอนเพิ่ม (key remount). นี่คือ feedback signature ของฝั่งลูกค้า.

## 6. Do's and Don'ts

### Do:
- **Do** ใช้พื้น `--ink #16101C` เป็นผืนเดียวทั้งแอป — ความอบอุ่นมาจาก accent+typography ไม่ใช่พื้นสว่าง.
- **Do** สงวน glow-chili ให้ "ปุ่มร้อนหลักหนึ่งเดียวต่อหน้า" (The One Sign Rule).
- **Do** ใส่ตัวเลขข้อมูลทั้งหมด (฿, %, กม., เวลา, อัตรา) ด้วย Space Mono (The Mono-Number Rule).
- **Do** ยกการ์ดด้วยโทน (ink→ink-card) + ขอบ ink-line 1px, ไม่ใช่เงา.
- **Do** แยกลำดับชั้น label ด้วยน้ำหนัก+สี paper-dim (ไทยไม่มีตัวพิมพ์ใหญ่).
- **Do** ให้ทุก motion มีทางเลือก `prefers-reduced-motion` (ระบบปิด animation/transition ทั้งหมดผ่าน global rule อยู่แล้ว).
- **Do** ปรับความหนาแน่นตามฝ่าย: ลูกค้าโปร่ง, คอนโซลร้าน/ไรเดอร์/แอดมินแน่นเน้นข้อมูล.

### Don't:
- **Don't** ทำให้ดูเหมือน **แอปส่งอาหารทั่วไป (สว่าง ขาว-ส้ม)** แบบ Grab/LineMan/foodpanda — ห้ามพื้นขาว, ห้ามส้มสดเป็นสีหลัก, ห้ามการ์ดเหมือนกันเรียงกันจนจำแบรนด์ไม่ได้.
- **Don't** ทำ **SaaS dashboard เทมเพลต** — ห้าม hero-metric การ์ดใหญ่, ห้าม eyebrow ตัวเล็ก uppercase ทุก section, ห้าม gradient text (`background-clip:text`).
- **Don't** ดูหรูเย็นชาแบบคอร์ปอเรตจนไม่เหลือกลิ่นสตรีทฟู้ด.
- **Don't** ใส่ glow บนทุกปุ่ม — glow เกลื่อน = ไม่มีป้ายไหนเด่น (ผิด The One Sign Rule).
- **Don't** ใช้เงาดำดรอปทำการ์ดลอยแบบ Material (The Glow-Is-Not-Shadow Rule).
- **Don't** ใช้ side-stripe border (`border-left` > 1px เป็นแถบสี) บนการ์ด/alert — ใช้ขอบเต็มหรือพื้นจางแทน.
- **Don't** ใช้ `--paper-dim #9C8FA6` กับ body ยาวบนพื้นเข้ม ถ้า contrast ไม่ถึง 4.5:1 — ดันไปทาง paper.
