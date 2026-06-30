import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StoreProvider, useStore } from './store';
import type { HydrateSource } from './store';
import type { Restaurant } from './data/catalog';

// คอมโพเนนต์ทดสอบ: โชว์รายชื่อ id ร้านใน state (seed = 7 ร้าน ขึ้นต้น khao-man-kai)
function RestaurantsProbe() {
  const { state } = useStore();
  return <span data-testid="ids">{state.restaurants.map((r) => r.id).join(',')}</span>;
}

// คอมโพเนนต์ทดสอบ admin reads: ออเดอร์/ระงับ/บัญชี/อัตราคอม จาก state
function AdminProbe() {
  const { state } = useStore();
  return (
    <>
      <span data-testid="orders">{state.orders.map((o) => `${o.id}:${o.rider ?? '-'}`).join(',')}</span>
      <span data-testid="suspended">{state.suspended.join(',')}</span>
      <span data-testid="downranked">{state.downranked.join(',')}</span>
      <span data-testid="disputes">{state.disputes.map((d) => d.id).join(',')}</span>
      <span data-testid="ledger">{state.ledger.length}</span>
      <span data-testid="override">{state.rateOverrides['cha-maimuk'] ?? 'none'}</span>
    </>
  );
}

const apiRestaurant: Restaurant = {
  id: 'from-api', name: 'ร้านจาก backend', icon: '🛰️', g: 'g1', rating: '★ 5.0',
  cat: 'ทดสอบ', blurb: 'มาจาก GET /restaurants', coord: { lat: 13.8, lng: 100.5 }, dishes: [],
};

describe('StoreProvider — hydrate ร้านจาก backend (cutover slice 1)', () => {
  it('hydrate: แทนร้าน seed ด้วยข้อมูลจาก API', async () => {
    const source: HydrateSource = { getRestaurants: async () => [apiRestaurant] };
    render(<StoreProvider hydrate={source}><RestaurantsProbe /></StoreProvider>);

    // ตอน mount ยังเป็น seed ก่อน แล้วค่อยถูกแทนด้วยข้อมูล API
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('from-api'));
    expect(screen.getByTestId('ids').textContent).toBe('from-api'); // แทนทั้งชุด ไม่เหลือ seed
  });

  it('hydrate ล้มเหลว (API ล่ม) → คงร้าน seed ใช้งานต่อได้', async () => {
    const source: HydrateSource = { getRestaurants: async () => { throw new Error('offline'); } };
    render(<StoreProvider hydrate={source}><RestaurantsProbe /></StoreProvider>);

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('khao-man-kai'));
  });

  it('ไม่เปิด hydrate → ใช้ร้าน seed (เทสต์อื่นไม่ยิง API)', () => {
    render(<StoreProvider><RestaurantsProbe /></StoreProvider>);
    expect(screen.getByTestId('ids')).toHaveTextContent('khao-man-kai');
  });
});

describe('StoreProvider — hydrate admin reads (cutover slice 2)', () => {
  const adminSource: HydrateSource = {
    getOrders: async () => [
      { id: 'A1', restaurantId: 'somtam', riderId: 'rider:nid', customerId: 'customer:aon',
        placed: { restaurantId: 'somtam', lines: [] }, state: { kind: 'Completed' } },
    ],
    getDisputes: async () => [
      { id: 'dpX', orderId: 'A1', customer: 'customer:aon', merchant: 'merchant:somtam',
        rider: 'rider:nid', category: 'wrong_item', hasPhoto: true, status: 'open', refund: 0 },
    ],
    getModeration: async () => [
      { account: 'rider:somchai', suspended: true, downranked: false, notified: true },
      { account: 'merchant:khao-man-kai', suspended: false, downranked: true, notified: true },
    ],
    getLedger: async () => [
      { account: 'merchant:somtam', amount: 280, kind: 'credit', orderId: 'A1', memo: 'ค่าอาหารสุทธิ' },
    ],
    getRateOverrides: async () => ({ 'cha-maimuk': 0.18 }),
  };

  it('hydrate: orders/moderation/disputes/ledger/rateOverrides จาก API แทน seed', async () => {
    render(<StoreProvider hydrate={adminSource}><AdminProbe /></StoreProvider>);

    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('A1:rider:nid'));
    expect(screen.getByTestId('suspended').textContent).toBe('rider:somchai'); // adapter: filter suspended
    expect(screen.getByTestId('downranked').textContent).toBe('merchant:khao-man-kai');
    expect(screen.getByTestId('disputes').textContent).toBe('dpX');
    expect(screen.getByTestId('ledger').textContent).toBe('1');
    expect(screen.getByTestId('override').textContent).toBe('0.18');
  });
});
