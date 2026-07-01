import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Merchant } from './Merchant';
import { renderWithProviders } from '../../test/render';

// store seed มีออเดอร์เริ่มที่ AwaitingHandoff/PendingAccept (รอร้านรับ) + เมนูข้าวมันไก่
describe('Merchant — คอนโซลรับออเดอร์', () => {
  it('แสดงรายการออเดอร์ + ปุ่มรับ/ปฏิเสธ ตอนรอร้านรับ', () => {
    renderWithProviders(<Merchant />);
    expect(screen.getByText('รอร้านรับออเดอร์')).toBeInTheDocument();
    expect(screen.getByText(/ข้าวมันไก่ต้ม/, { selector: '.m-item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'รับออเดอร์' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ปฏิเสธ' })).toBeInTheDocument();
  });

  it('รับออเดอร์ → กำลังทำ → อาหารเสร็จ: ปุ่มเปลี่ยนตามสถานะ', async () => {
    renderWithProviders(<Merchant />);
    await userEvent.click(screen.getByRole('button', { name: 'รับออเดอร์' }));
    expect(screen.getByText('กำลังทำอาหาร')).toBeInTheDocument();

    const ready = screen.getByRole('button', { name: 'อาหารเสร็จ' });
    await userEvent.click(ready);
    expect(screen.getByText('อาหารเสร็จ รอไรเดอร์มารับ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อาหารเสร็จ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ปฏิเสธ' })).not.toBeInTheDocument();
    expect(screen.getByText(/รอขั้นตอนถัดไป/)).toBeInTheDocument();
  });

  it('ปฏิเสธออเดอร์ → ขึ้นสถานะปฏิเสธ ไม่มีปุ่มให้กดแล้ว', async () => {
    renderWithProviders(<Merchant />);
    await userEvent.click(screen.getByRole('button', { name: 'ปฏิเสธ' }));
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยันปฏิเสธ' }));
    expect(screen.getByText('ร้านปฏิเสธออเดอร์')).toBeInTheDocument();
    expect(screen.getByText(/จบหน้าที่ของร้านแล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'รับออเดอร์' })).not.toBeInTheDocument();
  });
});
