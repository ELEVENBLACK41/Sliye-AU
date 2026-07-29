import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';

import { ThemeProvider } from '@/components/theme-provider';
import { NotificationRuntime } from '@/features/notifications/components/notification-runtime';
import { NotificationTestButton } from '@/features/notifications/components/notification-test-button';
import { Toaster } from '@workspace/ui/components/sonner';

import '../styles/globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** Satoshi 用于全站英文字形；中文字符会回退到 Geist。 */
const satoshi = localFont({
  src: [
    { path: '../fonts/Satoshi-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/Satoshi-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/Satoshi-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Decision Hub',
  description: '面向关键决策闭环的协作系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${satoshi.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <NotificationRuntime />
          <NotificationTestButton />
          <Toaster position="top-center" duration={3_000} closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
