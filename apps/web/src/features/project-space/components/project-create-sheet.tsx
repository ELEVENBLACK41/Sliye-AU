/**
 * 本文件在新版项目空间内提供项目创建 Sheet，并复用已验证的真实创建接口和错误闭环。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Building2, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ApiClientError } from '@/services/request';
import type { ProjectCreateDepartmentOption } from '../types/project-space.type';
import { createProjectSpaceProject } from '../services/project-space-client.service';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { Textarea } from '@workspace/ui/components/textarea';
import { cn } from '@workspace/ui/lib/utils';

/** 新版项目创建入口属性。 */
type ProjectCreateSheetProps = {
  /** 当前用户创建项目时可以选择的启用部门。 */
  departments: ProjectCreateDepartmentOption[];
  /** 创建按钮所在的新版页面区域。 */
  placement: 'sidebar' | 'empty';
};

/** 在当前项目空间打开项目创建表单，成功后进入新项目的公共讨论区。 */
export function ProjectCreateSheet({ departments, placement }: ProjectCreateSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id.toString() ?? '');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /** 关闭表单时清理短暂错误，保留未提交草稿避免误触丢失。 */
  function handleOpenChange(nextOpen: boolean): void {
    if (isPending && !nextOpen) return;
    setOpen(nextOpen);
    if (!nextOpen) setErrorMessage('');
  }

  /** 创建项目并直接进入新版项目空间中的公共讨论区。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending || !departmentId || title.trim().length < 2) return;
    setIsPending(true);
    setErrorMessage('');
    try {
      const project = await createProjectSpaceProject({
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: Number(departmentId),
      });
      setOpen(false);
      router.push(`/projects?projectId=${project.id}&areaId=${project.publicAreaId}`);
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          className={cn(
            'rounded-full bg-[#f5bf19] text-[#292a27] shadow-none hover:bg-[#eeb50b]',
            placement === 'sidebar' ? 'h-10 w-full' : 'mt-5',
          )}
        >
          <Plus className="size-4" aria-hidden />
          {placement === 'sidebar' ? '新建项目' : '创建项目'}
        </Button>
      </SheetTrigger>

      <SheetContent className="border-black/10 bg-[#f8f7f2] sm:max-w-[30rem]">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <span className="mb-3 grid size-10 place-items-center rounded-2xl bg-[#f5bf19] text-[#292a27]">
            <Building2 className="size-5" aria-hidden />
          </span>
          <SheetTitle className="text-xl font-semibold tracking-[-0.025em] text-[#292a27]">创建新项目</SheetTitle>
          <SheetDescription className="max-w-sm text-xs leading-5 text-black/48">
            创建后会自动初始化公共讨论区，并由你作为项目负责人继续邀请成员、建立小群组和记录决策。
          </SheetDescription>
        </SheetHeader>

        {departments.length ? (
          <form className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5" onSubmit={handleSubmit}>
            <div className="space-y-5 py-5">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="new-project-title" className="text-xs font-medium text-black/65">项目名称</Label>
                  <span className="text-[10px] text-black/30">{title.length}/120</span>
                </div>
                <Input
                  id="new-project-title"
                  value={title}
                  minLength={2}
                  maxLength={120}
                  required
                  autoFocus
                  placeholder="例如：智能风控升级计划"
                  className="h-11 rounded-xl border-black/10 bg-white/65 shadow-none"
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="new-project-description" className="text-xs font-medium text-black/65">项目背景</Label>
                  <span className="text-[10px] text-black/30">{description.length}/1000</span>
                </div>
                <Textarea
                  id="new-project-description"
                  value={description}
                  maxLength={1000}
                  rows={6}
                  placeholder="说明项目要解决的问题、协作范围或关键背景……"
                  className="resize-none rounded-xl border-black/10 bg-white/65 px-3 py-2.5 text-sm shadow-none"
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="new-project-department" className="text-xs font-medium text-black/65">发起部门</Label>
                <Select value={departmentId} onValueChange={setDepartmentId} disabled={isPending}>
                  <SelectTrigger id="new-project-department" className="h-11 w-full rounded-xl border-black/10 bg-white/65 shadow-none">
                    <SelectValue placeholder="选择项目所属部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] leading-4 text-black/38">所属部门决定项目的初始组织范围，创建后仍由后端权限规则控制访问。</p>
              </div>

              {errorMessage ? (
                <Alert variant="destructive" className="bg-white/65">
                  <AlertCircle aria-hidden />
                  <AlertTitle>项目创建失败</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <SheetFooter className="mt-auto border-t border-black/[0.07] px-0 pt-4 pb-0 sm:flex-row">
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={isPending || !departmentId || title.trim().length < 2}
                className="bg-[#292a27] text-white hover:bg-[#3b3c38]"
              >
                {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
                {isPending ? '正在创建…' : '创建并进入项目'}
              </Button>
            </SheetFooter>
          </form>
        ) : (
          <div className="p-5">
            <Alert className="border-black/10 bg-white/60">
              <Building2 aria-hidden />
              <AlertTitle>暂无可用的发起部门</AlertTitle>
              <AlertDescription>当前账号没有可选择的启用部门，暂时无法创建项目。</AlertDescription>
            </Alert>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
