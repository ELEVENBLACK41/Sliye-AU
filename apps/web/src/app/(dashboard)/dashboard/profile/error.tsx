/**
 * 本文件提供个人信息页面的客户端错误边界。
 */
'use client';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/** 个人信息页面错误边界属性。 */
type ErrorPageProps = {
  /** 重新渲染当前路由段的方法。 */
  reset: () => void;
};

/** 展示资料读取失败状态并允许用户重试。 */
export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>个人信息加载失败</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>暂时无法读取你的个人资料，请稍后重试。</p>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
