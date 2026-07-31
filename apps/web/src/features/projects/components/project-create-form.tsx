/**
 * 本文件实现项目创建表单，成功后进入服务端初始化的项目空间。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { createProject } from '../services/projects-client.service';
import { ApiClientError } from '@/services/request';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Textarea } from '@workspace/ui/components/textarea';

/** 项目创建表单使用的部门选项。 */
export type ProjectDepartmentOption = { id: number; label: string };

/** 项目创建表单属性。 */
type ProjectCreateFormProps = {
  /** 当前用户创建范围内的启用部门。 */
  departments: ProjectDepartmentOption[];
};

/** 渲染项目创建表单。 */
export function ProjectCreateForm({ departments }: ProjectCreateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id.toString() ?? '');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /** 创建项目并跳转到公共讨论区。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending || !departmentId || title.trim().length < 2) return;
    setIsPending(true);
    setErrorMessage('');
    try {
      const project = await createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: Number(departmentId),
      });
      router.push(`/dashboard/projects/${project.id}?areaId=${project.publicAreaId}`);
      router.refresh();
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : '项目创建失败';
      setErrorMessage(requestId ? `${message}（请求编号：${requestId}）` : message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus aria-hidden />
          创建项目
        </CardTitle>
      </CardHeader>
      <CardContent>
        {departments.length ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="project-title">项目标题</Label>
              <Input
                id="project-title"
                value={title}
                minLength={2}
                maxLength={120}
                required
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">背景说明</Label>
              <Textarea
                id="project-description"
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-department">发起部门</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="project-department" className="w-full">
                  <SelectValue placeholder="选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={String(department.id)}>
                      {department.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button disabled={isPending || !departmentId || title.trim().length < 2}>
              {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {isPending ? '正在创建…' : '创建并进入项目'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">当前没有可用的发起部门。</p>
        )}
      </CardContent>
    </Card>
  );
}
