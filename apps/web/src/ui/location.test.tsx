import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render';
import { useStore, deliveryCoord, deliveryLabel } from './store';
import { AllRestaurants } from './pages/AllRestaurants';

describe('หน้ารวมร้าน (AllRestaurants) — render จาก state.restaurants', () => {
  it('แสดงร้านทั้งหมดจาก seed (7 ร้าน) + ลิงก์ไปหน้าร้าน', () => {
    renderWithProviders(<AllRestaurants />);
    expect(screen.getByText(/ร้านอาหารทั้งหมด \(7\)/)).toBeInTheDocument();
    expect(screen.getByText('ข้าวมันไก่ตำนาน ลาดพร้าว')).toBeInTheDocument();
    expect(screen.getByText('ข้าวต้มโต้รุ่งเฮียอ้วน')).toBeInTheDocument();
  });
});

function DProbe() {
  const { state, dispatch } = useStore();
  return (
    <>
      <span data-testid="label">{deliveryLabel(state)}</span>
      <span data-testid="lat">{deliveryCoord(state).lat}</span>
      <button onClick={() => dispatch({ type: 'setDeliveryLocation', coord: { lat: 13.9, lng: 100.6 }, label: 'ที่ทำงาน' })}>set</button>
    </>
  );
}

describe('ที่อยู่จัดส่ง (deliveryCoord/setDeliveryLocation)', () => {
  it('ค่าตั้งต้น = ลาดพร้าว ซ.1; ปักหมุดใหม่ → อัปเดต coord + label', async () => {
    renderWithProviders(<DProbe />);
    expect(screen.getByTestId('label')).toHaveTextContent('ลาดพร้าว ซ.1');

    await userEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('label')).toHaveTextContent('ที่ทำงาน');
    expect(screen.getByTestId('lat')).toHaveTextContent('13.9');
  });
});
