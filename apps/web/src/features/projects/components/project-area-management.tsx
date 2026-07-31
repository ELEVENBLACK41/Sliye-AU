/**
 * 本文件负责创建私有分区，并维护当前可见私有分区的状态与成员。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  DiscussionAreaMember,
  DiscussionAreaStatus,
  DiscussionAreaSummary,
  ProjectDetail,
  ProjectMember,
} from '@workspace/contracts/projects';

import {
  addAreaMember,
  createProjectArea,
  removeAreaMember,
  updateProjectArea,
} from '../services/projects-client.service';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Textarea } from '@workspace/ui/components/textarea';

/** 私有分区管理组件属性。 */
type ProjectAreaManagementProps = {
  project: ProjectDetail;
  members: ProjectMember[];
  currentArea: DiscussionAreaSummary;
  areaMembers: DiscussionAreaMember[];
};

/** 渲染私有分区创建和当前分区维护界面。 */
export function ProjectAreaManagement({ project, members, currentArea, areaMembers }: ProjectAreaManagementProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialMemberIds, setInitialMemberIds] = useState<number[]>([]);
  const [newMemberId, setNewMemberId] = useState('');

  /** 执行分区写操作并刷新服务端数据。 */
  async function run(action: () => Promise<unknown>): Promise<void> {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '私有分区操作失败');
    } finally {
      setPending(false);
    }
  }

  /** 创建私有分区并加入选定初始成员。 */
  function handleCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim().length < 2) return;
    void run(async () => {
      await createProjectArea(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: initialMemberIds,
      });
      setName('');
      setDescription('');
      setInitialMemberIds([]);
    });
  }

  /** 把一名项目成员加入当前私有分区。 */
  function handleAddMember(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedUserId = Number(newMemberId);
    if (!Number.isInteger(parsedUserId) || parsedUserId < 1) return;
    void run(async () => {
      await addAreaMember(project.id, currentArea.id, { userId: parsedUserId, role: 'MEMBER' });
      setNewMemberId('');
    });
  }

  /** 切换新分区的初始成员。 */
  function toggleInitialMember(userId: number): void {
    setInitialMemberIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  const candidates = members.filter(
    (member) => !areaMembers.some((areaMember) => areaMember.user.id === member.user.id),
  );

  return (
    <div className="space-y-5">
      <form className="grid gap-4" onSubmit={handleCreate}>
        <div className="grid gap-2">
          <Label htmlFor="private-area-name">新分区名称</Label>
          <Input id="private-area-name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="private-area-description">用途说明</Label>
          <Textarea
            id="private-area-description"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">初始成员</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <Button
                key={member.id}
                type="button"
                size="sm"
                variant={initialMemberIds.includes(member.user.id) ? 'secondary' : 'outline'}
                aria-pressed={initialMemberIds.includes(member.user.id)}
                onClick={() => toggleInitialMember(member.user.id)}
              >
                {member.user.name || `用户 ${member.user.id}`}
              </Button>
            ))}
          </div>
        </fieldset>
        <Button disabled={pending || name.trim().length < 2}>创建私有分区</Button>
      </form>

      {currentArea.type === 'PRIVATE' ? (
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">当前分区：{currentArea.name}</p>
            <Select
              value={currentArea.status}
              onValueChange={(status) =>
                void run(() => updateProjectArea(project.id, currentArea.id, { status: status as DiscussionAreaStatus }))
              }
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">可写</SelectItem>
                <SelectItem value="READ_ONLY">只读</SelectItem>
                <SelectItem value="ARCHIVED">归档</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form className="flex gap-2" onSubmit={handleAddMember}>
            <Select value={newMemberId} onValueChange={setNewMemberId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="选择项目成员" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((member) => (
                  <SelectItem key={member.id} value={String(member.user.id)}>
                    {member.user.name || `用户 ${member.user.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={pending || !newMemberId}>加入分区</Button>
          </form>
          <ul className="space-y-2">
            {areaMembers.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>
                  {member.user.name || `用户 ${member.user.id}`} · {member.role === 'MANAGER' ? '管理员' : '成员'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void run(() => removeAreaMember(project.id, currentArea.id, member.user.id))}
                >
                  移除
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="border-t pt-4 text-sm text-muted-foreground">
          切换到你可见的私有分区后，可维护该分区成员和状态。
        </p>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
