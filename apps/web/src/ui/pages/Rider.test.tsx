import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rider } from './Rider';
import { renderWithProviders } from '../../test/render';
import type { State } from '../store';
import { restaurants } from '../data/catalog';

// สถานะตั้งต้น: ไรเดอร์ถึงร้านแล้ว + อาหารเสร็จ (จุดบรรจบ) เพื่อทดสอบ pickup เป็นต้นไป
const atMerchantReady: State = {
  cart: { lines: [] },
  restaurantId: null,
  order: { kind: 'AwaitingHandoff', merchant: 'Ready', rider: 'AtMerchant' },
  placed: { restaurantId: 'khao-man-kai', lines: [
    { id: 'x', itemName: 'ข้าวมันไก่ต้ม', basePrice: 50, spice: '', options: [], qty: 1, note: '' },
  ] },
  restaurants,
  orders: [],
  suspended: [],
  downranked: [],
  notified: [],
  ledger: [],
  disputes: [],
  rateOverrides: {},
  rateRequests: [],
};

describe('Rider — คอนโซลไรเดอร์', () => {
  it('seed: มีงานใหม่ → คว้างานได้ + เห็นร้าน/รายการ', () => {
    renderWithProviders(<Rider />);
    expect(screen.getByText('มีงานใหม่ รอไรเดอร์คว้า')).toBeInTheDocument();
    expect(screen.getByText(/ข้าวมันไก่ต้ม/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คว้างาน' })).toBeInTheDocument();
  });

  it('คว้างาน → ถึงร้าน: อาหารยังไม่เสร็จจึงรับอาหารไม่ได้', async () => {
    renderWithProviders(<Rider />);
    await userEvent.click(screen.getByRole('button', { name: 'คว้างาน' }));
    expect(screen.getByText('รับงานแล้ว กำลังไปร้าน')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ถึงร้าน' }));
    expect(screen.getByText('ถึงร้านแล้ว รออาหารเสร็จ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'รับอาหาร' })).not.toBeInTheDocument(); // จุดบรรจบกั้นไว้
  });

  it('ไรเดอร์ถูกพักงาน: คว้างานไม่ได้ (แบนเนอร์ + ปุ่มถูกปิด)', () => {
    const suspended: State = {
      cart: { lines: [] },
      restaurantId: null,
      order: { kind: 'AwaitingHandoff', merchant: 'PendingAccept', rider: 'Unclaimed' },
      placed: { restaurantId: 'khao-man-kai', lines: [
        { id: 'x', itemName: 'ข้าวมันไก่ต้ม', basePrice: 50, spice: '', options: [], qty: 1, note: '' },
      ] },
      restaurants,
      orders: [],
      suspended: ['rider:somchai'], // = RIDER_ID ในหน้า Rider
      downranked: [],
      notified: [],
      ledger: [],
      disputes: [],
      rateOverrides: {},
      rateRequests: [],
    };
    renderWithProviders(<Rider />, { initialState: suspended });
    expect(screen.getByText(/ถูกพักงาน/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คว้างาน' })).toBeDisabled();
  });

  it('ไรเดอร์ถูกลดอันดับ: คว้างานไม่ได้จนกว่าจะพ้นช่วงให้สิทธิ์อันดับสูง (ADR 0001/0006)', async () => {
    const down: State = {
      cart: { lines: [] },
      restaurantId: null,
      order: { kind: 'AwaitingHandoff', merchant: 'PendingAccept', rider: 'Unclaimed' },
      placed: { restaurantId: 'khao-man-kai', lines: [
        { id: 'x', itemName: 'ข้าวมันไก่ต้ม', basePrice: 50, spice: '', options: [], qty: 1, note: '' },
      ] },
      restaurants, orders: [], suspended: [], downranked: ['rider:somchai'], notified: [],
      ledger: [], disputes: [], rateOverrides: {}, rateRequests: [],
    };
    renderWithProviders(<Rider />, { initialState: down });
    expect(screen.getByText(/เปิดให้ไรเดอร์อันดับสูงคว้าก่อน/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คว้างาน' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'ข้ามช่วงรอ (เดโม)' })); // พ้นช่วงรอ
    expect(screen.getByRole('button', { name: 'คว้างาน' })).toBeEnabled();
  });

  it('จุดบรรจบพร้อม → รับอาหาร → ส่ง → ยืนยัน OTP → ส่งสำเร็จ', async () => {
    renderWithProviders(<Rider />, { initialState: atMerchantReady });
    expect(screen.getByText('อาหารพร้อม รับได้เลย')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'รับอาหาร' }));
    expect(screen.getByText('กำลังไปส่งลูกค้า')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ถึงหน้าบ้าน' }));
    expect(screen.getByText('ถึงหน้าบ้านลูกค้า')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ยืนยัน OTP' }));
    expect(screen.getByText('ส่งสำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('งานนี้จบแล้ว')).toBeInTheDocument();
  });
});
