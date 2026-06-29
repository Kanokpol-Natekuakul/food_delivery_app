// ตัวช่วย render คอมโพเนนต์พร้อม provider ที่จำเป็น (store + router)
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../ui/store';
import type { State } from '../ui/store';

type Options = {
  /** เส้นทางเริ่มต้นของ router (ตั้ง :param ของหน้าได้ เช่น ['/r/somtam/st-thai']) */
  initialEntries?: string[];
  /** override state เริ่มต้นของ store (จำลองสถานการณ์ในเทสต์) */
  initialState?: State;
};

/** render โดยห่อด้วย StoreProvider + MemoryRouter (เหมือนตอนรันจริง) */
export function renderWithProviders(
  ui: ReactElement,
  { initialEntries = ['/'], initialState }: Options = {},
) {
  const storeProps = initialState ? { initialState } : {};
  function Providers({ children }: { children: ReactNode }) {
    return (
      <StoreProvider {...storeProps}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </StoreProvider>
    );
  }
  return render(ui, { wrapper: Providers });
}
