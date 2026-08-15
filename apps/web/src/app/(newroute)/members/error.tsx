/**
 * 本文件为新版组织与权限路由提供中文错误边界和恢复操作。
 */
'use client';

import { useEffect } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 路由错误边界属性。 */
type MembersErrorProps = { error: Error & { digest?: string }; reset: () => void };

/** 渲染脱敏错误说明和重试按钮。 */
export default function MembersError({ error, reset }: MembersErrorProps) {
  useEffect(() => { console.error('组织与权限页面加载失败', error); }, [error]);
  return <section className="grid flex-1 place-items-center py-12"><div className="max-w-md rounded-[1.75rem] border bg-organization-surface p-8 text-center"><ShieldAlert className="mx-auto size-10 text-destructive" aria-hidden /><h1 className="mt-4 text-xl font-semibold">组织与权限加载失败</h1><p className="mt-2 text-sm text-muted-foreground">{error.message || '服务暂时不可用，请稍后重试。'}</p><Button className="mt-5 rounded-full" onClick={reset}><RotateCcw aria-hidden />重新加载</Button></div></section>;
}
