/**
 * 本文件在新版项目空间中完成组织用户加入项目的真实业务闭环。
 */
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ProjectMember, ProjectMemberCandidate, ProjectMemberRole } from '@workspace/contracts/projects';

import { addProjectSpaceMember } from '../services/project-space-client.service';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 可在创建成员关系时分配的非负责人角色。 */
type AssignableProjectRole = Exclude<ProjectMemberRole, 'OWNER'>;

/** 新版项目成员添加面板属性。 */
type ProjectMemberCreatePanelProps = {
  /** 当前项目主键。 */
  projectId: number;
  /** 当前项目是否允许继续添加成员。 */
  isProjectActive: boolean;
  /** 当前项目已有成员。 */
  members: ProjectMember[];
  /** 服务端按权限返回的可加入用户。 */
  candidates: ProjectMemberCandidate[];
};

/** 搜索候选用户、分配项目角色并加入当前项目。 */
export function ProjectMemberCreatePanel({
  projectId,
  isProjectActive,
  members,
  candidates,
}: ProjectMemberCreatePanelProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [role, setRole] = useState<AssignableProjectRole>('MEMBER');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const filteredCandidates = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN');
    if (!normalizedKeyword) return candidates;
    return candidates.filter((candidate) =>
      [candidate.name, candidate.email, candidate.department.name].some((value) =>
        value?.toLocaleLowerCase('zh-CN').includes(normalizedKeyword),
      ),
    );
  }, [candidates, keyword]);

  /** 把当前选中的组织用户添加到项目并刷新新版首屏数据。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const candidate = candidates.find((item) => item.id === selectedUserId);
    if (!candidate || isPending || !isProjectActive) return;
    setIsPending(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await addProjectSpaceMember(projectId, { userId: candidate.id, role });
      setSelectedUserId(null);
      setKeyword('');
      setSuccessMessage(`${candidate.name || candidate.email} 已加入项目`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '项目成员添加失败');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="project-space-member-search">选择组织用户</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-black/30" aria-hidden />
            <Input
              id="project-space-member-search"
              value={keyword}
              disabled={!isProjectActive || isPending}
              placeholder="搜索姓名、邮箱或部门"
              className="h-10 rounded-xl border-black/10 bg-white/65 pl-9 shadow-none"
              onChange={(event) => {
                setKeyword(event.currentTarget.value);
                setSelectedUserId(null);
              }}
            />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-black/[0.07] bg-white/42 p-1.5">
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => {
                const isSelected = selectedUserId === candidate.id;
                const name = candidate.name || candidate.email;
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant="ghost"
                    className={`h-auto w-full justify-start gap-3 rounded-xl px-2.5 py-2 text-left ${isSelected ? 'bg-[#fff3c4] hover:bg-[#fff0b0]' : 'hover:bg-white/65'}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedUserId(candidate.id)}
                  >
                    <Avatar className="size-8">
                      <AvatarImage src={candidate.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{name}</span>
                      <span className="block truncate text-[10px] font-normal text-black/40">
                        {candidate.email} · {candidate.department.name}
                      </span>
                    </span>
                    {isSelected ? <CheckCircle2 className="size-4 text-[#9a7400]" aria-hidden /> : null}
                  </Button>
                );
              })
            ) : (
              <p className="px-3 py-8 text-center text-xs leading-5 text-black/40">
                {!isProjectActive
                  ? '项目关闭或归档后不能添加成员。'
                  : keyword
                    ? '没有匹配的可加入用户。'
                    : '当前没有可加入用户。'}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="project-space-member-role">项目角色</Label>
          <Select value={role} onValueChange={(value) => setRole(value as AssignableProjectRole)} disabled={isPending}>
            <SelectTrigger id="project-space-member-role" className="h-10 w-full rounded-xl border-black/10 bg-white/65 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANAGER">项目管理员</SelectItem>
              <SelectItem value="MEMBER">项目成员</SelectItem>
              <SelectItem value="VIEWER">只读查看者</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={isPending || selectedUserId === null || !isProjectActive}
          className="w-full bg-[#292a27] text-white hover:bg-[#3b3c38]"
        >
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
          {isPending ? '正在添加…' : '加入项目'}
        </Button>
      </form>

      {errorMessage ? <Alert variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
      {successMessage ? <Alert className="border-emerald-600/20 bg-emerald-50/70 text-emerald-800"><CheckCircle2 aria-hidden /><AlertDescription>{successMessage}</AlertDescription></Alert> : null}

      <div className="border-t border-black/[0.07] pt-4">
        <p className="text-[10px] font-medium tracking-[0.12em] text-black/35">CURRENT MEMBERS · {members.length}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white/55 px-2.5 py-1 text-[10px] text-black/55">
              {member.user.name || `用户 ${member.user.id}`}
              <span className="text-black/28">{getMemberRoleText(member.role)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 返回项目成员角色的紧凑中文说明。 */
function getMemberRoleText(role: ProjectMemberRole): string {
  return { OWNER: '负责人', MANAGER: '管理员', MEMBER: '成员', VIEWER: '只读' }[role];
}
