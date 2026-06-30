import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider, useStore } from './store';
import type { MutationSource } from './store';

// MutationSource ที่ทุกฟังก์ชันเป็น spy — ตรวจว่า dispatch ไหน mirror ไป API ตัวไหน
function spySource() {
  return {
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    resolveDispute: vi.fn().mockResolvedValue(undefined),
    suspendActor: vi.fn().mockResolvedValue(undefined),
    unsuspendActor: vi.fn().mockResolvedValue(undefined),
    runSettlement: vi.fn().mockResolvedValue(undefined),
    approveRateRequest: vi.fn().mockResolvedValue(undefined),
    rejectRateRequest: vi.fn().mockResolvedValue(undefined),
    counterRateRequest: vi.fn().mockResolvedValue(undefined),
    acceptCounterOffer: vi.fn().mockResolvedValue(undefined),
    declineCounterOffer: vi.fn().mockResolvedValue(undefined),
  } satisfies MutationSource;
}

function Probe() {
  const { dispatch } = useStore();
  return (
    <>
      <button onClick={() => dispatch({ type: 'adminCancelOrder', id: '1041' })}>cancel</button>
      <button onClick={() => dispatch({ type: 'toggleSuspend', actor: 'rider:nid' })}>suspend</button>
      <button onClick={() => dispatch({ type: 'walletRunSettlement' })}>settle</button>
      <button onClick={() => dispatch({ type: 'resolveDispute', id: 'dp1', amount: 25 })}>resolve</button>
    </>
  );
}

describe('StoreProvider — write path mirror ไป backend (cutover slice 3)', () => {
  it('sync เปิด: dispatch → ยิง API ตรง action + อาร์กิวเมนต์', async () => {
    const m = spySource();
    render(<StoreProvider sync={m}><Probe /></StoreProvider>);

    await userEvent.click(screen.getByText('cancel'));
    expect(m.cancelOrder).toHaveBeenCalledWith('1041');

    // seed: rider:nid ยังไม่ถูกระงับ → mirror เลือก suspendActor (ไม่ใช่ unsuspend)
    await userEvent.click(screen.getByText('suspend'));
    expect(m.suspendActor).toHaveBeenCalledWith('rider:nid');
    expect(m.unsuspendActor).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('settle'));
    expect(m.runSettlement).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByText('resolve'));
    expect(m.resolveDispute).toHaveBeenCalledWith('dp1', 25);
  });

  it('sync ปิด: dispatch ทำงาน local เท่านั้น ไม่ยิง API', async () => {
    const m = spySource();
    render(<StoreProvider><Probe /></StoreProvider>); // ไม่ส่ง sync
    await userEvent.click(screen.getByText('cancel'));
    await userEvent.click(screen.getByText('settle'));
    expect(m.cancelOrder).not.toHaveBeenCalled();
    expect(m.runSettlement).not.toHaveBeenCalled();
  });
});
