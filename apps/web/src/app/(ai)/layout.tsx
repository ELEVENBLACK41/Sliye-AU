/**
 * 本文件让 AI 实验页面复用新版工作台的认证校验和导航外壳。
 */
import type { ReactNode } from 'react';

import WorkspaceLayout from '../(newroute)/layout';
import { AiPostStreamProvider } from '@/features/ai/components/ai-post-stream-provider';

/** AI 一级路由布局属性。 */
type AiLayoutProps = Readonly<{
  /** AI 页面内容。 */
  children: ReactNode;
}>;

/** 在新版工作台外壳内保持 AI POST 流跨页面路由切换存活。 */
export default async function AiLayout({ children }: AiLayoutProps) {
  return (
    <WorkspaceLayout>
      <AiPostStreamProvider>{children}</AiPostStreamProvider>
    </WorkspaceLayout>
  );
}
