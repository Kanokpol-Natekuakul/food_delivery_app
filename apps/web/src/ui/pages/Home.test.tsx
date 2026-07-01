import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from './Home';
import { App } from '../App';
import type { State } from '../store';
import { restaurants } from '../data/catalog';
import { renderWithProviders } from '../../test/render';

const stateWith = (downranked: string[]): State => ({
  cart: { lines: [] }, restaurantId: null, order: null, placed: null,
  restaurants, orders: [], suspended: [], downranked, notified: [],
  ledger: [], disputes: [], rateOverrides: {}, rateRequests: [],
});

describe('Home — ค้นหา / หมวดหมู่ / Service Zone', () => {
  // ร้านโผล่ได้ทั้งแถว "เปิดอยู่ตอนนี้" และ "ใกล้คุณ" — scope query ไปลิสต์ "ใกล้คุณ" (ทุกร้านจาก catalog)
  const near = () => within(screen.getByLabelText('ร้านใกล้คุณ'));

  it('พิมพ์ในช่องค้นหาแล้วกรองรายการให้เหลือเฉพาะร้านที่ชื่อตรง', async () => {
    renderWithProviders(<Home />);
    // ก่อนค้นหา เห็นหลายร้าน
    expect(near().getByText('ส้มตำแซ่บนัว')).toBeInTheDocument();
    expect(near().getByText('ข้าวต้มโต้รุ่งเฮียอ้วน')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'ค้นหาเมนูหรือร้าน' }), 'ส้มตำ');

    expect(near().getByText('ส้มตำแซ่บนัว')).toBeInTheDocument();
    expect(screen.queryByText('ข้าวต้มโต้รุ่งเฮียอ้วน')).not.toBeInTheDocument();
  });

  it('กดชิปหมวดหมู่แล้วกรองตามหมวด', async () => {
    renderWithProviders(<Home />);
    await userEvent.click(screen.getByRole('button', { name: /ก๋วยเตี๋ยว/ }));

    expect(near().getByText('ก๋วยเตี๋ยวเรือป้านิด')).toBeInTheDocument();
    expect(screen.queryByText('ชาไข่มุกซอย 5')).not.toBeInTheDocument(); // หมวดเครื่องดื่ม ถูกกรองออก
  });

  it('ร้านนอกพื้นที่จัดส่งติดป้าย "นอกพื้นที่"', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('นอกพื้นที่')).toBeInTheDocument();
  });

  it('ร้านที่ถูกลดอันดับ (auto-action ADR 0006) ตกไปท้ายลิสต์ "ใกล้คุณ"', () => {
    // ปกติ "ชาไข่มุกซอย 5" อยู่อันดับแรกของลิสต์ใกล้คุณ
    const { unmount } = renderWithProviders(<Home />, { initialState: stateWith([]) });
    const baseline = within(screen.getByLabelText('ร้านใกล้คุณ'))
      .getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(baseline[0]).toBe('ชาไข่มุกซอย 5');
    unmount();

    // ลดอันดับร้านชาไข่มุก → ตกไปท้ายสุด (ร้านอื่นเลื่อนขึ้น คงลำดับเดิม)
    renderWithProviders(<Home />, { initialState: stateWith(['merchant:cha-maimuk']) });
    const ranked = within(screen.getByLabelText('ร้านใกล้คุณ'))
      .getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(ranked[0]).toBe('ข้าวมันไก่ตำนาน ลาดพร้าว'); // ชื่อเต็มจาก catalog จริง
    expect(ranked[ranked.length - 1]).toBe('ชาไข่มุกซอย 5');
  });

  it('เปิด/ปิด drawer ด้วยปุ่ม hamburger', async () => {
    renderWithProviders(<App />);
    expect(screen.queryByRole('dialog', { name: 'เมนูหลัก' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'เปิดเมนู' }));
    expect(screen.getByRole('dialog', { name: 'เมนูหลัก' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ปิดเมนู' }));
    expect(screen.queryByRole('dialog', { name: 'เมนูหลัก' })).not.toBeInTheDocument();
  });
});
