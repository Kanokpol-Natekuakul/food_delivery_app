import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { Cart } from './Cart';
import { renderWithProviders } from '../../test/render';
import type { State } from '../store';
import { restaurants } from '../data/catalog';

function renderCart(initialState?: State) {
  return renderWithProviders(
    <Routes>
      <Route path="/cart" element={<Cart />} />
      <Route path="/track" element={<div>หน้าติดตาม (mock)</div>} />
    </Routes>,
    initialState ? { initialEntries: ['/cart'], initialState } : { initialEntries: ['/cart'] },
  );
}

describe('Cart — ร้านในเขต/นอกเขต', () => {
  it('ร้านในเขต (seed): แสดงชื่อร้าน + ระยะ/ค่าส่ง + ปุ่มสั่งใช้ได้', () => {
    renderCart();
    expect(screen.getByText(/ข้าวมันไก่ตำนาน/)).toBeInTheDocument();
    expect(screen.getByText(/กม\./)).toBeInTheDocument(); // มี note ระยะทางในแถวค่าส่ง
    expect(screen.getByRole('button', { name: /สั่งเลย/ })).toBeEnabled();
  });

  it('ตะกร้าผูกร้านนอกเขต: ปุ่มสั่งถูกปิด ไม่มีปุ่ม "สั่งเลย"', () => {
    const offZone: State = {
      cart: {
        lines: [
          { id: 'x', itemName: 'ข้าวผัดกระเพราหมูสับไข่ดาว', basePrice: 60,
            spice: 'เผ็ดกลาง', options: [], qty: 1, note: '' },
        ],
      },
      restaurantId: 'khao-tom-rung', // นอกรัศมีบริการ
      order: null,
      placed: null,
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
    renderCart(offZone);
    expect(screen.getByRole('button', { name: /ร้านนอกพื้นที่จัดส่ง/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /สั่งเลย/ })).not.toBeInTheDocument();
  });
});
