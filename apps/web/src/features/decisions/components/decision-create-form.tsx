/**
 * 本文件实现最小决策创建表单，目标部门只允许选择当前账号可见的启用部门。
 */
'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { createDecision } from '@/features/decisions/services/decisions-client.service';
import { ApiClientError } from '@/services/request';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 决策创建表单中的部门选项。 */
export type DecisionDepartmentOption = {
  /** 部门数据库主键。 */
  id: number;
  /** 带层级缩进的部门中文名称。 */
  label: string;
};

/** 决策创建表单属性。 */
type DecisionCreateFormProps = {
  /** 当前用户创建范围内可选择的启用部门。 */
  departments: DecisionDepartmentOption[];
};

/** 渲染决策创建表单，并在成功后跳转新决策详情。 */
export function DecisionCreateForm({ departments }: DecisionCreateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id.toString() ?? '');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /** 提交最小决策，并把结构化错误的 requestId 一并展示给用户。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!departmentId || isPending) {
      return;
    }

    setIsPending(true);
    setErrorMessage('');

    try {
      const decision = await createDecision({
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: Number(departmentId),
      });
      router.push(`/dashboard/decisions/${decision.id}`);
      router.refresh();
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : '决策创建失败，请稍后重试';
      setErrorMessage(requestId ? `${message}（请求编号：${requestId}）` : message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="size-4" aria-hidden />
          创建决策
        </CardTitle>
      </CardHeader>
      <CardContent>
        {departments.length ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="decision-title">决策标题</Label>
              <Input
                id="decision-title"
                value={title}
                minLength={2}
                maxLength={120}
                required
                placeholder="例如：是否重构权限模块"
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="decision-description">背景说明（可选）</Label>
              <Input
                id="decision-description"
                value={description}
                maxLength={1000}
                placeholder="说明目标、背景或待解决问题"
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="decision-department">所属部门</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="decision-department" className="w-full">
                  <SelectValue placeholder="请选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id.toString()}>
                      {department.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
            <Button disabled={!title.trim() || !departmentId || isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              创建并进入详情
            </Button>
          </form>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            当前没有可用于创建决策的启用部门，请先联系管理员完成部门分配或启用部门。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
