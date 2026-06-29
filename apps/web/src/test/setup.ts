// ตั้งค่ากลางสำหรับเทสต์ฝั่ง UI (Vitest + Testing Library)
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ถอด DOM ที่ render หลังจบแต่ละเทสต์ กันสถานะรั่วข้ามเคส
afterEach(() => cleanup());
