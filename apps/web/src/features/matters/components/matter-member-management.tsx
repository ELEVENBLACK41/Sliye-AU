/**
 * 本文件负责议事成员新增、角色调整和移除操作。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MatterDetail, MatterMember, MatterMemberCandidate } from '@workspace/contracts/matters';

import { addMatterMember, removeMatterMember, updateMatterMember } from '../services/matters-client.service';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 可由普通成员接口维护的议事角色。 */
type MutableMatterMemberRole = 'MANAGER' | 'MEMBER' | 'VIEWER';

/** 渲染议事成员管理表单和成员清单。 */
export function MatterMemberManagement({
  matter,
  members,
  candidates,
}: {
  matter: MatterDetail;
  members: MatterMember[];
  candidates: MatterMemberCandidate[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [role, setRole] = useState<MutableMatterMemberRole>('MEMBER');
  const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
  const filteredCandidates = normalizedSearch
    ? candidates.filter((candidate) =>
        [candidate.name, candidate.email, candidate.department.name].some((value) =>
          value?.toLocaleLowerCase('zh-CN').includes(normalizedSearch),
        ),
      )
    : candidates;

  /** 执行成员写操作并刷新页面。 */
  async function run(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    if (pending) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '议事成员操作失败');
    } finally {
      setPending(false);
    }
  }

  /** 添加一名议事成员。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const candidate = candidates.find((item) => item.id === selectedCandidateId);
    if (!candidate) return;
    void run(
      async () => {
        await addMatterMember(matter.id, { userId: candidate.id, role });
        setSelectedCandidateId(null);
        setSearch('');
      },
      `${candidate.name || candidate.email} 已加入议事`,
    );
  }

  return (
    <div className="space-y-5">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="matter-member-search">选择要加入的用户</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="matter-member-search"
              className="pl-9"
              value={search}
              placeholder="搜索姓名、邮箱或部门"
              disabled={matter.status !== 'ACTIVE'}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setSelectedCandidateId(null);
              }}
            />
          </div>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-2">
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant={selectedCandidateId === candidate.id ? 'secondary' : 'ghost'}
                  className="h-auto w-full justify-start px-3 py-2 text-left"
                  aria-pressed={selectedCandidateId === candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{candidate.name || candidate.email}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {candidate.email} · {candidate.department.name}
                    </span>
                  </span>
                </Button>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {matter.status !== 'ACTIVE'
                  ? '议事关闭或归档后不能调整成员，请先重新开放。'
                  : search
                    ? '没有匹配的可加入用户。'
                    : '当前没有可加入用户；已加入、未启用或未完成组织授权的账号不会显示。'}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>议事角色</Label>
          <MemberRoleSelect value={role} onChange={setRole} />
        </div>
        <Button disabled={pending || selectedCandidateId === null || matter.status !== 'ACTIVE'}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}添加所选成员
        </Button>
      </form>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span className="mr-auto text-sm">{member.user.name || `用户 ${member.user.id}`}</span>
            {member.role === 'OWNER' ? (
              <span className="text-xs text-muted-foreground">负责人</span>
            ) : (
              <>
                <MemberRoleSelect
                  value={member.role}
                  onChange={(nextRole) =>
                    void run(() => updateMatterMember(matter.id, member.user.id, { role: nextRole }), '成员角色已更新')
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void run(() => removeMatterMember(matter.id, member.user.id), '成员已移出议事')}
                >
                  移除
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </div>
  );
}

/** 渲染可复用的议事成员角色选择器。 */
function MemberRoleSelect({
  value,
  onChange,
}: {
  value: MutableMatterMemberRole;
  onChange: (role: MutableMatterMemberRole) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextRole) => onChange(nextRole as MutableMatterMemberRole)}>
      <SelectTrigger size="sm" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="MANAGER">管理员</SelectItem>
        <SelectItem value="MEMBER">成员</SelectItem>
        <SelectItem value="VIEWER">查看者</SelectItem>
      </SelectContent>
    </Select>
  );
}
