import { describe, it, expect } from 'vitest';
import { App } from './App';
import { renderWithProviders } from '../test/render';

// #3: เดิม index.html ตั้ง <title> ตายตัวทุกหน้า → DocumentTitle ตั้งชื่อแท็บตาม route
describe('DocumentTitle — ชื่อแท็บเบราว์เซอร์ตาม route (#3)', () => {
  it('หน้าแรกใช้แบรนด์ล้วน', () => {
    renderWithProviders(<App />, { initialEntries: ['/'] });
    expect(document.title).toBe('ตลาดเปิดเมื่อนั้น');
  });

  it('หน้าที่กำหนดคงที่ → "<ชื่อหน้า> · แบรนด์"', () => {
    renderWithProviders(<App />, { initialEntries: ['/cart'] });
    expect(document.title).toBe('ตะกร้า · ตลาดเปิดเมื่อนั้น');
  });

  it('หน้าติดตามออเดอร์ไม่ใช่ title ของทุกหน้า (regression ของบั๊กเดิม)', () => {
    renderWithProviders(<App />, { initialEntries: ['/admin'] });
    expect(document.title).toBe('ผู้ดูแลระบบ · ตลาดเปิดเมื่อนั้น');
    expect(document.title).not.toContain('ติดตามออเดอร์');
  });

  it('หน้าร้าน → ชื่อร้าน · แบรนด์ (ดึงจาก catalog จริง)', () => {
    renderWithProviders(<App />, { initialEntries: ['/r/khao-man-kai'] });
    expect(document.title).toBe('ข้าวมันไก่ตำนาน ลาดพร้าว · ตลาดเปิดเมื่อนั้น');
  });

  it('หน้าเมนู → ชื่อเมนู · ชื่อร้าน · แบรนด์', () => {
    renderWithProviders(<App />, { initialEntries: ['/r/khao-man-kai/kmk-tom'] });
    expect(document.title).toBe('ข้าวมันไก่ต้ม · ข้าวมันไก่ตำนาน ลาดพร้าว · ตลาดเปิดเมื่อนั้น');
  });
});
