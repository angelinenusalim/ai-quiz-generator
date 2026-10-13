import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false, env: { VITE_API_BASE_URL: '/' } },
    { command: 'npm --prefix ../server start', url: 'http://127.0.0.1:8080/api/health', reuseExistingServer: true },
  ],
});
