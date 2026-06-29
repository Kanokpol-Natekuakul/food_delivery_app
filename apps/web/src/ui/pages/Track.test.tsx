import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Track } from './Track';
import type { State } from '../store';
import { renderWithProviders } from '../../test/render';
import { restaurants } from '../data/catalog';
import { DELIVERY_TIMEOUT_MIN, CLAIM_EXPIRY_MIN } from '@app/domain/order/timers';

// ออเดอร์สดที่ส่งสำเร็จแล้ว → เปิดทางให้กล่องร้องเรียนหลังส่ง (ADR 0006)
const completed: State = {
  cart: { lines: [] },
  restaurantId: null,
  order: { kind: 'Completed' },
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

// store seed เริ่มที่ออเดอร์ AwaitingHandoff (merchant=PendingAccept, rider=Unclaimed)
// คุมเวลาเองด้วยการ "หยุดเวลา" แล้วกด +1 นาที เพื่อให้ deterministic (ไม่พึ่ง setInterval จริง)
async function stopClockAndStep(times: number) {
  await userEvent.click(screen.getByRole('button', { name: '⏸ หยุดเวลา' }));
  const step = screen.getByRole('button', { name: '+1 นาที' });
  for (let i = 0; i < times; i++) await userEvent.click(step);
}

describe('Track — auto-fire ตัวจับเวลา', () => {
  it(`Y: ไม่มีไรเดอร์ครบ ${DELIVERY_TIMEOUT_MIN} นาที → ระบบยกเลิกออเดอร์เอง`, async () => {
    renderWithProviders(<Track />);
    await stopClockAndStep(DELIVERY_TIMEOUT_MIN);
    expect(await screen.findByText(/ระบบยกเลิกอัตโนมัติ/)).toBeInTheDocument();
  });

  it(`Z: ไรเดอร์คว้างานแล้วครบ ${CLAIM_EXPIRY_MIN} นาที → ปลดงานคืนลิสต์เอง`, async () => {
    renderWithProviders(<Track />);
    await userEvent.click(screen.getByRole('button', { name: '⏸ หยุดเวลา' }));
    await userEvent.click(screen.getByRole('button', { name: 'ไรเดอร์คว้างาน' }));
    const step = screen.getByRole('button', { name: '+1 นาที' });
    for (let i = 0; i < CLAIM_EXPIRY_MIN; i++) await userEvent.click(step);
    expect(await screen.findByText(/ปลดงานคืนลิสต์อัตโนมัติ/)).toBeInTheDocument();
  });

  it('ยกเลิกฟรีพ้นหน้าต่างแล้ว (เกิน 90 วิจำลอง) → โดเมนปฏิเสธ', async () => {
    renderWithProviders(<Track />);
    await stopClockAndStep(2); // 2 นาทีจำลอง = 120 วิ > 90 วิ
    await userEvent.click(screen.getByRole('button', { name: /ลูกค้ายกเลิก/ }));
    expect(await screen.findByText(/พ้นหน้าต่าง/)).toBeInTheDocument();
  });
});

describe('Track — ร้องเรียนหลังส่ง (ADR 0006)', () => {
  it('ออเดอร์สำเร็จ: กล่องร้องเรียนโผล่ + ต้องแนบรูปก่อนส่งได้', async () => {
    renderWithProviders(<Track />, { initialState: completed });
    expect(screen.getByText('แจ้งปัญหาหลังรับของ')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'ส่งเรื่องร้องเรียน' });
    expect(submit).toBeDisabled(); // ยังไม่แนบรูป

    await userEvent.click(screen.getByRole('checkbox'));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(screen.getByText(/รับเรื่องร้องเรียนแล้ว/)).toBeInTheDocument();
  });
});
