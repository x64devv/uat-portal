import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vantage UAT',
  description: 'The ZimChoice supermarket test script: who ran each step, when, and what they saw.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
