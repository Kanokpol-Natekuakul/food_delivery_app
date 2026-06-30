import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider, useStore, merchantRestaurantId } from './store';
import type { AuthClient, State } from './store';
import { Login } from './pages/Login';

// authClient ปลอม — me() ปฏิเสธ (ยังไม่ล็อกอิน) เว้นแต่ override
function fakeAuth(over: Partial<AuthClient> = {}): AuthClient {
  return {
    login: vi.fn(async (actorId: string) => ({ actorId, role: 'customer' })),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => { throw new Error('401'); }),
    ...over,
  };
}

function Probe() {
  const { state, login, logout } = useStore();
  return (
    <>
      <span data-testid="who">{state.auth?.actorId ?? 'none'}</span>
      <button onClick={() => { void login('customer:aon', 'demo1234'); }}>in</button>
      <button onClick={() => { void logout(); }}>out</button>
    </>
  );
}

describe('auth ฝั่ง web (Lucia session)', () => {
  it('login: ตั้ง state.auth จากผลล็อกอิน; logout: ล้างเป็น null', async () => {
    const auth = fakeAuth();
    render(<StoreProvider authClient={auth}><Probe /></StoreProvider>);
    expect(screen.getByTestId('who').textContent).toBe('none');

    await userEvent.click(screen.getByText('in'));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('customer:aon'));
    expect(auth.login).toHaveBeenCalledWith('customer:aon', 'demo1234');

    await userEvent.click(screen.getByText('out'));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('me() ตอน mount: ถ้ามีเซสชันอยู่แล้ว → ตั้ง auth อัตโนมัติ', async () => {
    const auth = fakeAuth({ me: vi.fn(async () => ({ actorId: 'admin:root', role: 'admin' })) });
    render(<StoreProvider authClient={auth}><Probe /></StoreProvider>);
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('admin:root'));
  });

  it('merchantRestaurantId: merchant ที่ล็อกอิน → ตัด prefix; ไม่งั้น fallback เดโม', () => {
    const asState = (auth: State['auth']) => ({ auth } as unknown as State);
    expect(merchantRestaurantId(asState({ actorId: 'merchant:somtam', role: 'merchant' }))).toBe('somtam');
    expect(merchantRestaurantId(asState(null))).toBe('khao-man-kai'); // ไม่ล็อกอิน
    expect(merchantRestaurantId(asState({ actorId: 'admin:root', role: 'admin' }))).toBe('khao-man-kai'); // ไม่ใช่ merchant
  });

  it('หน้า Login: รหัสผิด → โชว์ error ไม่ทำให้ล่ม', async () => {
    const auth = fakeAuth({ login: vi.fn(async () => { throw new Error('actorId หรือรหัสผ่านไม่ถูกต้อง'); }) });
    render(
      <MemoryRouter>
        <StoreProvider authClient={auth}><Login /></StoreProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByTestId('login-actor'), 'customer:aon');
    await userEvent.type(screen.getByTestId('login-password'), 'wrong');
    await userEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('ไม่ถูกต้อง'));
  });
});
