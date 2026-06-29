import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MerchantRate } from './MerchantRate';
import { Admin } from './Admin';
import { renderWithProviders } from '../../test/render';

// หน้า Admin ใช้ localStorage จำรอบ settlement — ล้างก่อนทุกเทสต์
beforeEach(() => localStorage.clear());

describe('MerchantRate — เจรจาอัตราคอมมิชชัน', () => {
  it('ดูอัตราปัจจุบัน + ยื่นขอลด → คำขอขึ้นสถานะรออนุมัติ', async () => {
    renderWithProviders(<MerchantRate />);
    expect(screen.getByTestId('current-commission')).toHaveTextContent('30%'); // khao-man-kai อัตราตั้งต้น
    await userEvent.click(screen.getByRole('button', { name: 'ส่งคำขอ' }));      // ค่าเริ่มต้นเสนอ 25%
    expect(screen.getByText(/คอม 30%/)).toBeInTheDocument();
    expect(screen.getByText('รออนุมัติ')).toBeInTheDocument();
  });

  it('end-to-end: ร้านยื่น → แอดมินอนุมัติ → อัตราของร้านลดลงจริง', async () => {
    renderWithProviders(<><MerchantRate /><Admin /></>);
    expect(screen.getByTestId('current-commission')).toHaveTextContent('30%');
    await userEvent.click(screen.getByRole('button', { name: 'ส่งคำขอ' }));      // ร้านยื่นขอ 25%
    await userEvent.click(screen.getByRole('button', { name: /อนุมัติคำขอ/ }));   // แอดมินอนุมัติ
    expect(screen.getByTestId('current-commission')).toHaveTextContent('25%');  // อัตราปัจจุบันลดเหลือ 25%
  });

  it('end-to-end สองทาง: ร้านยื่น → แอดมินเสนอแย้ง → ร้านตอบรับ → อัตราเป็นค่าที่เสนอแย้ง', async () => {
    renderWithProviders(<><MerchantRate /><Admin /></>);
    await userEvent.click(screen.getByRole('button', { name: 'ส่งคำขอ' }));         // ร้านขอ 25%
    await userEvent.click(screen.getByRole('button', { name: /เสนอแย้ง ร้าน/ }));    // แอดมินเสนอแย้ง 28% (กึ่งกลาง 25–30)
    await userEvent.click(screen.getByRole('button', { name: /ตอบรับข้อเสนอแย้ง/ })); // ร้านตอบรับ
    expect(screen.getByTestId('current-commission')).toHaveTextContent('28%');     // อัตราเป็นค่าที่เสนอแย้ง ไม่ใช่ 25%
  });
});
