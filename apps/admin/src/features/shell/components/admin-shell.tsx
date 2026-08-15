'use client';

/*
 * @Description: 这个文件负责组合 admin 后台的 sidebar 和主内容区。
 */
import type { ReactNode } from 'react';

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@workspace/ui/components/sidebar';

import { AdminSidebar } from './admin-sidebar';

/** 渲染 admin 后台整体应用壳。 */
function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <SidebarTrigger className="fixed left-3 top-3 z-50 bg-background shadow-sm md:hidden" />
        <div className="flex-1 overflow-auto bg-muted/30">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { AdminShell };
