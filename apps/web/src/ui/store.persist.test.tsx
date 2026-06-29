import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider, useStore } from './store';

// คอมโพเนนต์ทดสอบ: โชว์รายชื่อที่ถูกระงับ + ปุ่มสลับระงับไรเดอร์ (mutation ที่ทำงานเสมอ)
function Probe() {
  const { state, dispatch } = useStore();
  return (
    <>
      <span data-testid="suspended">{state.suspended.join(',')}</span>
      <button onClick={() => dispatch({ type: 'toggleSuspend', actor: 'rider:nid' })}>toggle</button>
    </>
  );
}

// คอมโพเนนต์ทดสอบประวัติออเดอร์: จำนวนออเดอร์ในระบบ + ปุ่มทำให้ออเดอร์สดสำเร็จ
function HistoryProbe() {
  const { state, dispatch } = useStore();
  return (
    <>
      <span data-testid="orders">{state.orders.length}</span>
      <button onClick={() => dispatch({ type: 'setOrder', order: { kind: 'Completed' } })}>complete</button>
    </>
  );
}

beforeEach(() => localStorage.clear());

describe('StoreProvider — persist state ข้ามรีโหลด', () => {
  it('persist: state ที่แก้แล้วคงอยู่เมื่อ mount ใหม่ (โหลดจาก localStorage)', async () => {
    const { unmount } = render(<StoreProvider persist><Probe /></StoreProvider>);
    await userEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('suspended')).toHaveTextContent('rider:nid');

    unmount(); // จำลองรีโหลด
    render(<StoreProvider persist><Probe /></StoreProvider>);
    expect(screen.getByTestId('suspended')).toHaveTextContent('rider:nid'); // ยังถูกระงับอยู่
  });

  it('persist: เวอร์ชันโครงไม่ตรง → ทิ้งข้อมูลเก่า เริ่มจาก seed', () => {
    localStorage.setItem('food-app.state', JSON.stringify({ v: 999, s: { suspended: ['rider:nid'] } }));
    render(<StoreProvider persist><Probe /></StoreProvider>);
    expect(screen.getByTestId('suspended').textContent).toBe(''); // ไม่โหลดของเวอร์ชันเก่า
  });

  it('ไม่มี persist: ไม่เขียน localStorage + mount ใหม่กลับเป็น seed', async () => {
    const { unmount } = render(<StoreProvider><Probe /></StoreProvider>);
    await userEvent.click(screen.getByText('toggle'));
    expect(localStorage.getItem('food-app.state')).toBeNull(); // ไม่ persist

    unmount();
    render(<StoreProvider><Probe /></StoreProvider>);
    expect(screen.getByTestId('suspended').textContent).toBe(''); // seed: ยังไม่มีใครถูกระงับ
  });
});

describe('ประวัติออเดอร์ (per-party order history aggregate)', () => {
  it('ออเดอร์สดสำเร็จครั้งแรก → ต่อท้ายประวัติ (ปริมาณโต); ทำซ้ำไม่เพิ่ม', async () => {
    render(<StoreProvider><HistoryProbe /></StoreProvider>);
    const before = Number(screen.getByTestId('orders').textContent); // seed = 4
    await userEvent.click(screen.getByText('complete'));
    expect(Number(screen.getByTestId('orders').textContent)).toBe(before + 1);
    await userEvent.click(screen.getByText('complete')); // สำเร็จซ้ำ → ไม่ต่อท้ายอีก
    expect(Number(screen.getByTestId('orders').textContent)).toBe(before + 1);
  });
});
