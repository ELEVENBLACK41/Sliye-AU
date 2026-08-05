/**
 * 本文件在新版项目空间中创建私有小群组，并为新旧小群组分配已有项目成员。
 */
'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Loader2, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DiscussionAreaMember, DiscussionAreaSummary, ProjectMember } from '@workspace/contracts/projects';

import {
  addProjectSpaceAreaMember,
  createProjectSpaceArea,
  getProjectSpaceAreaMembers,
} from '../services/project-space-client.service';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Textarea } from '@workspace/ui/components/textarea';

/** 新版小群组创建面板属性。 */
type ProjectGroupCreatePanelProps = {
  /** 当前项目主键。 */
  projectId: number;
  /** 当前项目是否允许新增协作关系。 */
  isProjectActive: boolean;
  /** 当前用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前项目已有成员。 */
  members: ProjectMember[];
};

/** 创建私有小群组并维护已有群组的新增成员。 */
export function ProjectGroupCreatePanel({
  projectId,
  isProjectActive,
  areas,
  members,
}: ProjectGroupCreatePanelProps) {
  const router = useRouter();
  const privateAreas = useMemo(() => areas.filter((area) => area.type === 'PRIVATE'), [areas]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialMemberIds, setInitialMemberIds] = useState<number[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState(privateAreas[0]?.id.toString() ?? '');
  const [areaMembers, setAreaMembers] = useState<DiscussionAreaMember[]>([]);
  const [newMemberId, setNewMemberId] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(privateAreas.length > 0);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 分区切换后按需读取显式成员，并处理过期响应。 */
  useEffect(() => {
    const areaId = Number(selectedAreaId);
    if (!Number.isInteger(areaId) || areaId < 1) return;
    let isCurrent = true;
    void getProjectSpaceAreaMembers(projectId, areaId)
      .then((items) => {
        if (isCurrent) setAreaMembers(items);
      })
      .catch((error) => {
        if (isCurrent) setErrorMessage(error instanceof Error ? error.message : '小群组成员加载失败');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingMembers(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [projectId, selectedAreaId]);

  /** 切换创建小群组时需要自动加入的初始项目成员。 */
  function toggleInitialMember(userId: number): void {
    setInitialMemberIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  /** 创建私有小群组并同步初始成员。 */
  async function handleCreateGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending || !isProjectActive || name.trim().length < 2) return;
    setIsPending(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const area = await createProjectSpaceArea(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: initialMemberIds,
      });
      setName('');
      setDescription('');
      setInitialMemberIds([]);
      setIsLoadingMembers(true);
      setSelectedAreaId(String(area.id));
      setSuccessMessage(`小群组“${area.name}”已创建`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '小群组创建失败');
    } finally {
      setIsPending(false);
    }
  }

  /** 把一名已有项目成员加入当前选择的小群组。 */
  async function handleAddGroupMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const areaId = Number(selectedAreaId);
    const userId = Number(newMemberId);
    const member = members.find((item) => item.user.id === userId);
    if (isPending || !member || !Number.isInteger(areaId) || areaId < 1) return;
    setIsPending(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const createdMember = await addProjectSpaceAreaMember(projectId, areaId, { userId, role: 'MEMBER' });
      setAreaMembers((current) => [...current, createdMember]);
      setNewMemberId('');
      setSuccessMessage(`${member.user.name || `用户 ${userId}`} 已加入小群组`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '加入小群组失败');
    } finally {
      setIsPending(false);
    }
  }

  const availableMembers = members.filter(
    (member) => !areaMembers.some((areaMember) => areaMember.user.id === member.user.id),
  );

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleCreateGroup}>
        <div>
          <p className="text-xs font-semibold">创建私有小群组</p>
          <p className="mt-1 text-[10px] leading-4 text-black/40">只有被选中的项目成员可以查看并参与该分区。</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-space-group-name">小群组名称</Label>
          <Input
            id="project-space-group-name"
            value={name}
            minLength={2}
            maxLength={80}
            disabled={!isProjectActive || isPending}
            placeholder="例如：风控技术评审组"
            className="h-10 rounded-xl border-black/10 bg-white/65 shadow-none"
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-space-group-description">用途说明</Label>
          <Textarea
            id="project-space-group-description"
            value={description}
            maxLength={1000}
            rows={3}
            disabled={!isProjectActive || isPending}
            className="resize-none rounded-xl border-black/10 bg-white/65 shadow-none"
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium">初始成员</legend>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-black/[0.07] bg-white/42 p-2">
            {members.map((member) => {
              const isSelected = initialMemberIds.includes(member.user.id);
              return (
                <Button
                  key={member.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  aria-pressed={isSelected}
                  className={isSelected ? 'border-[#d5a400]/35 bg-[#fff3c4] text-[#765900] hover:bg-[#ffefad]' : 'border-black/10 bg-white/65'}
                  onClick={() => toggleInitialMember(member.user.id)}
                >
                  {isSelected ? <Check className="size-3" aria-hidden /> : null}
                  {member.user.name || `用户 ${member.user.id}`}
                </Button>
              );
            })}
          </div>
        </fieldset>
        <Button type="submit" disabled={isPending || !isProjectActive || name.trim().length < 2} className="w-full bg-[#292a27] text-white hover:bg-[#3b3c38]">
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <UsersRound aria-hidden />}
          {isPending ? '正在创建…' : '创建小群组'}
        </Button>
      </form>

      <section className="space-y-3 border-t border-black/[0.07] pt-5" aria-labelledby="existing-groups-title">
        <div>
          <h3 id="existing-groups-title" className="text-xs font-semibold">已有小群组</h3>
          <p className="mt-1 text-[10px] text-black/40">选择小群组后，可继续从项目成员中添加人员。</p>
        </div>
        {privateAreas.length ? (
          <>
            <Select
              value={selectedAreaId}
              onValueChange={(value) => {
                setSelectedAreaId(value);
                setNewMemberId('');
                setAreaMembers([]);
                setErrorMessage('');
                setIsLoadingMembers(true);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-black/10 bg-white/65 shadow-none">
                <SelectValue placeholder="选择小群组" />
              </SelectTrigger>
              <SelectContent>
                {privateAreas.map((area) => <SelectItem key={area.id} value={String(area.id)}>{area.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {isLoadingMembers ? (
              <div className="space-y-2" aria-label="小群组成员正在加载"><Skeleton className="h-9 rounded-xl" /><Skeleton className="h-9 rounded-xl" /></div>
            ) : (
              <form className="flex gap-2" onSubmit={handleAddGroupMember}>
                <Select value={newMemberId} onValueChange={setNewMemberId} disabled={!availableMembers.length || isPending}>
                  <SelectTrigger className="min-w-0 flex-1 rounded-xl border-black/10 bg-white/65 shadow-none">
                    <SelectValue placeholder={availableMembers.length ? '选择项目成员' : '所有成员均已加入'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.map((member) => <SelectItem key={member.id} value={String(member.user.id)}>{member.user.name || `用户 ${member.user.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isPending || !newMemberId}>加入</Button>
              </form>
            )}
            <div className="flex flex-wrap gap-1.5">
              {areaMembers.map((member) => <span key={member.id} className="rounded-full border border-black/[0.07] bg-white/55 px-2.5 py-1 text-[10px] text-black/55">{member.user.name || `用户 ${member.user.id}`}</span>)}
            </div>
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-black/10 px-3 py-6 text-center text-xs text-black/40">还没有私有小群组。</p>
        )}
      </section>

      {errorMessage ? <Alert variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
      {successMessage ? <Alert className="border-emerald-600/20 bg-emerald-50/70 text-emerald-800"><CheckCircle2 aria-hidden /><AlertDescription>{successMessage}</AlertDescription></Alert> : null}
    </div>
  );
}
