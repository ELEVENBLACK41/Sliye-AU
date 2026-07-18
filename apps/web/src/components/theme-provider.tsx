/**
 * 本文件为 Web 应用提供浅色、深色和跟随系统的主题状态。
 */
'use client';

import type { ComponentProps } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** 把 next-themes 的主题能力注入整个 Web 应用。 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
