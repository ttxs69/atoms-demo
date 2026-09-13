import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    // System Chrome (Playwright's bundled chromium download keeps timing
    // out on this connection; the system Chrome is functionally identical).
    channel: 'chrome',
    // E2E needs a real backend (E2B + LLM + Supabase) — the .env drives it.
    // Each journey gets a FRESH page (no localStorage carry-over).
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  workers: 4,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
