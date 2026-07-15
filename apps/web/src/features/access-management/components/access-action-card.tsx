/**
 * 本文件提供权限管理操作区统一使用的卡片容器和反馈消息展示。
 */
import type { ReactNode } from 'react';

import type { AccessActionMessage } from '@/features/access-management/hooks/use-access-action';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 权限管理操作卡片属性。 */
type AccessActionCardProps = {
  /** 卡片中文标题。 */
  title: string;
  /** 当前卡片最近一次操作反馈。 */
  message: AccessActionMessage;
  /** 卡片表单内容。 */
  children: ReactNode;
};

/** 渲染权限管理操作卡片及其统一反馈区域。 */
export function AccessActionCard({ title, message, children }: AccessActionCardProps) {
  return (
    <Card className="mx-auto w-full max-w-4xl rounded-md shadow-none">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {message ? (
          <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
            {message.text}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}
