import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Forge',
  description: 'Describe what you want. A team builds it.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
