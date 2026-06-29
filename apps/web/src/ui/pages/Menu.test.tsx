import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { Menu } from './Menu';
import { renderWithProviders } from '../../test/render';

// seed ตะกร้าเริ่มต้นผูกกับร้าน 'khao-man-kai' (ดู store __seed)
function renderMenuAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/r/:restaurantId/:dishId" element={<Menu />} />
      <Route path="/cart" element={<div>หน้าตะกร้า (mock)</div>} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe('Menu — บล็อกนอกเขต / สลับร้าน', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ร้านนอกเขตบริการ: ปุ่มเพิ่มลงตะกร้าถูกปิด', () => {
    renderMenuAt('/r/khao-tom-rung/ktr-pad'); // ร้านนี้อยู่นอกรัศมี ~10.8 กม.
    expect(screen.getByRole('button', { name: /นอกพื้นที่จัดส่ง/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /เพิ่มลงตะกร้า/ })).not.toBeInTheDocument();
  });

  it('สั่งข้ามร้าน + ยืนยัน → เริ่มตะกร้าใหม่แล้วไปหน้าตะกร้า', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMenuAt('/r/somtam/st-thai'); // ตะกร้าเดิมเป็น khao-man-kai → ข้ามร้าน
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มลงตะกร้า/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText('หน้าตะกร้า (mock)')).toBeInTheDocument();
  });

  it('สั่งข้ามร้าน + ยกเลิก → อยู่หน้าเดิม ไม่ไปตะกร้า', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderMenuAt('/r/somtam/st-thai');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มลงตะกร้า/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByText('หน้าตะกร้า (mock)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เพิ่มลงตะกร้า/ })).toBeInTheDocument();
  });
});
