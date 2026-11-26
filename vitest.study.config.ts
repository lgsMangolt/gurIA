import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, '.') } },
  test: { include: ['tests/study/**/*.test.ts'], maxWorkers: 1, testTimeout: 30000 },
});
