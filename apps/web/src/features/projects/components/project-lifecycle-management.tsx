/**
 * 本文件负责项目关闭、重开和归档操作，并在请求完成后刷新服务端页面数据。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectDetail } from '@workspace/contracts/projects';

import { updateProjectStatus } from '../services/projects-client.service';
import { Button } from '@workspace/ui/components/button';

/** 渲染独立的项目生命周期管理区域。 */
export function ProjectLifecycleManagement({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 更新项目状态并刷新服务端数据。 */
  async function changeStatus(status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED'): Promise<void> {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await updateProjectStatus(project.id, { status });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '项目状态更新失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">当前状态：{project.status}</p>
      {project.status === 'ACTIVE' ? (
        <Button variant="outline" disabled={pending} onClick={() => void changeStatus('CLOSED')}>
          关闭项目
        </Button>
      ) : project.status === 'CLOSED' ? (
        <Button disabled={pending} onClick={() => void changeStatus('ACTIVE')}>
          重新开放
        </Button>
      ) : null}
      {project.status !== 'ARCHIVED' ? (
        <Button variant="destructive" disabled={pending} onClick={() => void changeStatus('ARCHIVED')}>
          归档项目
        </Button>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
