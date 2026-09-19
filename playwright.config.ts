import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000_000,
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
    timeout: 15_000_000,
  },
  // Real-LLM / real-E2B tests do not parallelize safely: concurrent
  // generations hit provider rate limits and an adapter error kills the
  // turn instantly (observed: 45ms streams). The suite is a manually-run
  // acceptance suite — determinism beats speed.
  workers: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
