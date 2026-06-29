/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // โดเมนถูกแตกเป็นแพ็กเกจ @app/domain — เว็บอ้างผ่าน alias (ไม่ต้อง pnpm install เพื่อ dev/test)
    alias: { '@app/domain': fileURLToPath(new URL('../../packages/domain/src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // เทสต์ฝั่ง UI เท่านั้น — ฝั่งโดเมนรันด้วย node:test (`npm test`) แยกกัน
    include: ['src/ui/**/*.test.{ts,tsx}'],
  },
});
