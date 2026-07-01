import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Admin } from './Admin';
import { Track } from './Track';
import type { State, AdminOrder } from '../store';
import { renderWithProviders } from '../../test/render';
import { restaurants } from '../data/catalog';
import type { Dispute } from '@app/domain/dispute/dispute';
import type { RateRequest } from '@app/domain/revenue/revenue';

// ปริมาณออเดอร์จริงของไรเดอร์ (ตัวหารอัตราร้องเรียน) — สร้างออเดอร์ n รายการให้ไรเดอร์รายนี้
const ridersOrders = (rider: string, n: number): AdminOrder[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `vo-${rider}-${i}`, placed: { restaurantId: 'khao-man-kai', lines: [] },
    state: { kind: 'Completed' as const }, rider,
  }));

// ไรเดอร์ somchai โดนร้อง 3 เคส จากปริมาณจริง 10 ออเดอร์ = 30% > เกณฑ์ 20% → "ดำเนินการ"
const mkDispute = (id: string): Dispute => ({
  id, orderId: id, customer: 'customer:x', merchant: 'merchant:m', rider: 'rider:somchai',
  category: 'wrong_item', hasPhoto: true, status: 'open', refund: 0,
});
const highRate: State = {
  cart: { lines: [] }, restaurantId: null, order: null, placed: null,
  restaurants, orders: ridersOrders('rider:somchai', 10), suspended: [], downranked: [], notified: [], ledger: [],
  disputes: [mkDispute('h1'), mkDispute('h2'), mkDispute('h3')],
  rateOverrides: {}, rateRequests: [],
};

// ตัวตั้งเวลารอบ settlement จำรอบล่าสุดใน localStorage — ล้างก่อนทุกเทสต์กันรั่วข้ามกัน
beforeEach(() => localStorage.clear());

// seed มีออเดอร์ 4 รายการ: #1042 (รอร้านรับ), #1041 (กำลังส่ง), #1039 (สำเร็จ), #1038 (ส่งไม่ได้)
describe('Admin — หลายออเดอร์ + suspend + force-cancel', () => {
  it('แสดงรายการออเดอร์ + สรุปการเงินของออเดอร์ที่จบแล้ว', () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText(/#1042/)).toBeInTheDocument();
    expect(screen.getByText(/#1038/)).toBeInTheDocument();
    expect(screen.getByText('ลูกค้าผิด')).toBeInTheDocument();      // #1038 FailedDelivery
    expect(screen.getByText('ไม่มีฝ่ายผิด')).toBeInTheDocument();   // #1039 Completed
  });

  it('force-cancel: ยกเลิกออเดอร์ที่ยังดำเนินอยู่ → กลายเป็น CancelledByAdmin', async () => {
    renderWithProviders(<Admin />);
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกออเดอร์ #1042' }));
    // ยืนยัน inline สองจังหวะ: กดครั้งแรกยังไม่ทำจริง — ต้องกด "ยืนยัน"
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยันยกเลิกออเดอร์ #1042' }));
    expect(screen.queryByRole('button', { name: 'ยกเลิกออเดอร์ #1042' })).not.toBeInTheDocument();
    expect(screen.getByText('CancelledByAdmin')).toBeInTheDocument();
  });

  it('Wallet: แสดงยอดบัญชี (แพลตฟอร์ม ฿50 = คอม+บริการ+ส่วนแบ่ง จาก #1039+#1038) + จ่ายออกแล้วยอดเป็น 0', async () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText('Wallet & Settlement')).toBeInTheDocument();
    expect(screen.getByText('฿50')).toBeInTheDocument(); // platformGross รวมหลังแตกส่วนแบ่ง + อัตราต่อร้าน (ADR 0003)
    await userEvent.click(screen.getByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' }));
    expect(screen.queryByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' })).not.toBeInTheDocument();
  });

  it('settlement: อัตราคอมมิชชันต่อร้าน — #1039 (cha-maimuk) 20% ต่างจาก #1038 (somtam) 30%', () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText(/หักคอม 20% = ฿9/)).toBeInTheDocument();   // cha-maimuk override 20% ของ ฿45
    expect(screen.getByText(/หักคอม 30% = ฿12/)).toBeInTheDocument();  // somtam อัตราตั้งต้น 30% ของ ฿40
  });

  it('suspend: ระงับไรเดอร์ → ขึ้นป้าย "พักงาน" และปุ่มเปลี่ยนเป็นปลดระงับ', async () => {
    renderWithProviders(<Admin />);
    expect(screen.queryByText('พักงาน')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ระงับ สมชาย (ไรเดอร์)' }));
    expect(screen.getByText('พักงาน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ปลดระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument();
  });

  it('dispute: แสดงคำร้องค้าง + คืน goodwill → ปิดเคส (แพลตฟอร์มแบก)', async () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText('ร้องเรียนหลังส่ง (1)')).toBeInTheDocument();
    expect(screen.getByText(/ได้ผิดรายการ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'คืน goodwill #1039' }));
    expect(screen.queryByRole('button', { name: 'คืน goodwill #1039' })).not.toBeInTheDocument();
    expect(screen.getByText(/คืน goodwill ฿45 \(แพลตฟอร์มแบก\)/)).toBeInTheDocument();
  });

  it('dispute: ปฏิเสธคำร้อง (สงสัยโกง) → ปิดเคสไม่คืนเงิน', async () => {
    renderWithProviders(<Admin />);
    await userEvent.click(screen.getByRole('button', { name: 'ปฏิเสธคำร้อง #1039' }));
    expect(screen.getByText(/ปฏิเสธคำร้อง \(ไม่คืนเงิน\)/)).toBeInTheDocument();
  });

  it('สถิติร้องเรียน (ADR 0006): seed → มีป้าย "จับตา" และ "ปกติ"', () => {
    renderWithProviders(<Admin />);
    expect(screen.getAllByText('จับตา').length).toBeGreaterThan(0); // somchai 1 เคส
    expect(screen.getAllByText('ปกติ').length).toBeGreaterThan(0);  // ไรเดอร์/ร้านที่ไม่มีเคส
  });

  it('สถิติร้องเรียน: อัตราเกินเกณฑ์ → ป้าย "ดำเนินการ"', () => {
    renderWithProviders(<Admin />, { initialState: highRate });
    expect(screen.getAllByText('ดำเนินการ').length).toBeGreaterThan(0);
  });

  it('รอบ settlement (ADR 0004): บัญชีต่ำกว่าขั้นต่ำสะสมไว้ + รันรอบจ่ายเฉพาะที่ถึงเกณฑ์', async () => {
    renderWithProviders(<Admin />);
    expect(screen.getAllByText(/ต่ำกว่าขั้นต่ำ/).length).toBeGreaterThan(0);        // ไรเดอร์/ร้าน < ฿50
    expect(screen.getByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' })).toBeInTheDocument(); // แพลตฟอร์ม ฿50 ถึงเกณฑ์
    await userEvent.click(screen.getByRole('button', { name: 'รันรอบ settlement' }));
    expect(screen.queryByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' })).not.toBeInTheDocument();   // จ่ายออกแล้ว
    expect(screen.queryByRole('button', { name: 'รันรอบ settlement' })).not.toBeInTheDocument();   // ไม่มีบัญชีถึงเกณฑ์เหลือ
  });

  it('schedule (ADR 0004): ไม่ถึงรอบ → ยังไม่จ่าย (โชว์เวลารอบถัดไป)', () => {
    renderWithProviders(<Admin />); // localStorage ว่าง → ตั้งรอบล่าสุด = ตอนนี้ → ยังไม่ถึง
    expect(screen.getByText(/รอบถัดไป \(เวลาจริง\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' })).toBeInTheDocument();
    expect(screen.queryByText(/รอบ settlement อัตโนมัติ/)).not.toBeInTheDocument();
  });

  it('schedule ผูกเวลาจริง (ADR 0004): เลยกำหนดรอบ → รันรอบ settlement อัตโนมัติเมื่อเปิดหน้า', async () => {
    // จำลองว่ารอบล่าสุดคือ 2 วันก่อน (เก็บใน localStorage) → คาบรายวันถึงกำหนดแล้ว
    localStorage.setItem('settlement.lastRunAt', String(Date.now() - 2 * 24 * 60 * 60 * 1000));
    renderWithProviders(<Admin />);
    expect(await screen.findByText(/รอบ settlement อัตโนมัติ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'จ่ายออก แพลตฟอร์ม' })).not.toBeInTheDocument(); // จ่ายออกอัตโนมัติแล้ว
  });

  it('เจรจาอัตราคอม (ADR 0003): แอดมินอนุมัติคำขอ → ปิดเป็น "อนุมัติแล้ว"', async () => {
    const pending: RateRequest = {
      id: 'rr1', merchantId: 'khao-man-kai', currentRate: 0.3, proposedRate: 0.25,
      reason: 'ยอดขายสูง', status: 'pending',
    };
    const st: State = {
      cart: { lines: [] }, restaurantId: null, order: null, placed: null,
      restaurants, orders: [], suspended: [], downranked: [], notified: [], ledger: [], disputes: [],
      rateOverrides: {}, rateRequests: [pending],
    };
    renderWithProviders(<Admin />, { initialState: st });
    expect(screen.getByText(/คอม 30% →/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /อนุมัติคำขอ/ }));
    expect(screen.getByText('ตกลงแล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /อนุมัติคำขอ/ })).not.toBeInTheDocument();
  });

  it('เจรจาอัตราคอมสองทาง (ADR 0003): แอดมินเสนอแย้ง → คำขอเข้าสถานะ countered (รอร้านตอบ)', async () => {
    const pending: RateRequest = {
      id: 'rr1', merchantId: 'khao-man-kai', currentRate: 0.3, proposedRate: 0.2,
      reason: '', status: 'pending',
    };
    const st: State = {
      cart: { lines: [] }, restaurantId: null, order: null, placed: null,
      restaurants, orders: [], suspended: [], downranked: [], notified: [], ledger: [], disputes: [],
      rateOverrides: {}, rateRequests: [pending],
    };
    renderWithProviders(<Admin />, { initialState: st });
    // ค่าเริ่มต้นช่องเสนอแย้ง = กึ่งกลาง (20+30)/2 = 25
    await userEvent.click(screen.getByRole('button', { name: /เสนอแย้ง ร้าน/ }));
    expect(screen.getByText(/เสนอแย้ง 25% · รอร้านตอบ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /อนุมัติคำขอ/ })).not.toBeInTheDocument();
  });

  it('ล้างข้อมูล/รีเซ็ต: คืนสถานะกลับเป็นค่าตั้งต้น (seed)', async () => {
    renderWithProviders(<Admin />);
    await userEvent.click(screen.getByRole('button', { name: 'ระงับ สมชาย (ไรเดอร์)' }));
    expect(screen.getByRole('button', { name: 'ปลดระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ล้างข้อมูลที่บันทึก/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยันล้างข้อมูล' })); // ยืนยัน inline
    expect(screen.getByRole('button', { name: 'ระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument(); // กลับ seed
  });

  it('auto-action "ดำเนินการ" (ADR 0006): ยื่นร้องจนเกินเกณฑ์ → แจ้งเตือน + ลดอันดับ + ระงับ', async () => {
    // ค้างไว้แล้ว 2 เคสกับ rider:somchai (ร้านไม่อยู่ในรายการกำกับ จึงไม่กระทบฝ่ายอื่น)
    const prior: Dispute[] = ['pre1', 'pre2'].map((id) => ({
      id, orderId: id, customer: `customer:${id}`, merchant: 'merchant:cha-maimuk',
      rider: 'rider:somchai', category: 'wrong_item', hasPhoto: true, status: 'open', refund: 0,
    }));
    const st: State = {
      cart: { lines: [] }, restaurantId: null,
      order: { kind: 'Completed' },
      placed: { restaurantId: 'cha-maimuk', lines: [
        { id: 'x', itemName: 'ชาไทยไข่มุก', basePrice: 45, spice: '', options: [], qty: 1, note: '' },
      ] },
      // ปริมาณจริง 8 ออเดอร์ของ somchai → 3 เคส = 37.5% > 20% → ดำเนินการ
      restaurants, orders: ridersOrders('rider:somchai', 8), suspended: [], downranked: [], notified: [], ledger: [], disputes: prior,
      rateOverrides: {}, rateRequests: [],
    };
    renderWithProviders(<><Track /><Admin /></>, { initialState: st });
    expect(screen.getByRole('button', { name: 'ระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument(); // ยังไม่ระงับ

    await userEvent.click(screen.getByRole('checkbox')); // แนบรูป
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเรื่องร้องเรียน' })); // ใบที่ 3
    expect(screen.getByRole('button', { name: 'ปลดระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument(); // ระงับ
    expect(screen.getByText('⚠️ แจ้งเตือน')).toBeInTheDocument();
    expect(screen.getByText('⬇️ ลดอันดับ')).toBeInTheDocument();
  });

  it('auto-action "จับตา" (ADR 0006): ยื่นร้องระดับจับตา → แจ้งเตือนอย่างเดียว (ไม่ลดอันดับ/ระงับ)', async () => {
    const st: State = {
      cart: { lines: [] }, restaurantId: null,
      order: { kind: 'Completed' },
      placed: { restaurantId: 'cha-maimuk', lines: [
        { id: 'x', itemName: 'ชาไทยไข่มุก', basePrice: 45, spice: '', options: [], qty: 1, note: '' },
      ] },
      // somchai มี 3 ออเดอร์ (< MIN 5) → ยื่น 1 เคสได้แค่ "จับตา"
      restaurants, orders: ridersOrders('rider:somchai', 3), suspended: [], downranked: [], notified: [], ledger: [], disputes: [],
      rateOverrides: {}, rateRequests: [],
    };
    renderWithProviders(<><Track /><Admin /></>, { initialState: st });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเรื่องร้องเรียน' }));
    expect(screen.getByText('⚠️ แจ้งเตือน')).toBeInTheDocument();
    expect(screen.queryByText('⬇️ ลดอันดับ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ระงับ สมชาย (ไรเดอร์)' })).toBeInTheDocument(); // ยังไม่ถูกระงับ
  });
});
