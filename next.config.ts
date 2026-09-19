import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The orchestrator and its adapters use Node APIs, so everything runs on the
  // Node.js runtime rather than Edge. `e2b` is kept out of the bundler.
  serverExternalPackages: ['e2b', '@electric-sql/pglite'],
  // The dev indicator's <nextjs-portal> intercepts pointer events in headless
  // e2e runs against the dev server (webServer: npm run dev).
  devIndicators: false,
};

export default nextConfig;
