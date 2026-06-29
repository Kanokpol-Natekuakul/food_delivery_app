import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MerchantMenu } from './MerchantMenu';
import { Restaurant } from './Restaurant';
import { StoreProvider } from '../store';
import { renderWithProviders } from '../../test/render';

function renderMenuEditor() {
  return renderWithProviders(
    <Routes>
      <Route path="/merchant/menu" element={<MerchantMenu />} />
    </Routes>,
    { initialEntries: ['/merchant/menu'] },
  );
}

describe('MerchantMenu — จัดการเมนู (CRUD)', () => {
  it('แสดงเมนู seed + เพิ่มเมนูใหม่ปรากฏในลิสต์', async () => {
    renderMenuEditor();
    expect(screen.getByText(/ข้าวมันไก่ต้ม/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('ชื่อเมนู'), 'ยำไก่แซ่บ');
    await userEvent.type(screen.getByLabelText('ราคา'), '65');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มเมนู' }));

    expect(screen.getByText(/ยำไก่แซ่บ/)).toBeInTheDocument();
  });

  it('validation: ชื่อว่าง → ขึ้น error ไม่เพิ่มเมนู', async () => {
    renderMenuEditor();
    await userEvent.type(screen.getByLabelText('ราคา'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มเมนู' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ต้องมีชื่อเมนู');
  });

  it('ลบเมนู → หายจากลิสต์', async () => {
    renderMenuEditor();
    expect(screen.getByText(/น้ำซุปเพิ่ม/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ลบ น้ำซุปเพิ่ม' }));
    expect(screen.queryByText(/น้ำซุปเพิ่ม/)).not.toBeInTheDocument();
  });

  it('แก้ไขราคา → อัปเดตในลิสต์', async () => {
    renderMenuEditor();
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข ข้าวมันไก่ต้ม' }));
    const editor = screen.getByRole('button', { name: 'บันทึก' }).closest('li') as HTMLElement;
    const price = within(editor).getByLabelText('ราคา');
    await userEvent.clear(price);
    await userEvent.type(price, '60');
    await userEvent.click(within(editor).getByRole('button', { name: 'บันทึก' }));
    expect(screen.getByText('฿60')).toBeInTheDocument();
  });

  it('integration: เพิ่มเมนูฝั่งร้าน → หน้าร้าน (ฝั่งลูกค้า) เห็นด้วย (store เดียวกัน)', async () => {
    render(
      <StoreProvider>
        <MemoryRouter initialEntries={['/merchant/menu']}>
          <Routes><Route path="/merchant/menu" element={<MerchantMenu />} /></Routes>
        </MemoryRouter>
        <MemoryRouter initialEntries={['/r/khao-man-kai']}>
          <Routes><Route path="/r/:restaurantId" element={<Restaurant />} /></Routes>
        </MemoryRouter>
      </StoreProvider>,
    );

    await userEvent.type(screen.getByLabelText('ชื่อเมนู'), 'เมนูทดสอบข้ามฝั่ง');
    await userEvent.type(screen.getByLabelText('ราคา'), '99');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มเมนู' }));

    // โผล่ทั้งฝั่งร้าน (ตัวจัดการ) และฝั่งลูกค้า (หน้าร้าน)
    expect(screen.getAllByText(/เมนูทดสอบข้ามฝั่ง/).length).toBeGreaterThanOrEqual(2);
  });
});
