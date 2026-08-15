/**
 * 本文件在项目空间右侧上下文栏与移动端抽屉中展示当前分区的成员范围。
 */
import { LockKeyhole, UsersRound } from 'lucide-react';
import type { DiscussionAreaMember, DiscussionAreaSummary, ProjectMember } from '@workspace/contracts/projects';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';

/** 当前分区成员展示组件的公共属性。 */
type ProjectCurrentAreaMembersProps = {
  /** 当前选中的讨论分区。 */
  area: DiscussionAreaSummary;
  /** 当前项目全部成员，公共分区直接继承该范围。 */
  projectMembers: ProjectMember[];
  /** 当前私有分区显式加入的成员。 */
  privateAreaMembers: DiscussionAreaMember[];
};

/** 成员列表统一使用的展示结构。 */
type AreaMemberViewModel = {
  /** 成员关系主键。 */
  id: number;
  /** 成员显示名称。 */
  name: string;
  /** 成员头像地址。 */
  avatarUrl: string | null;
  /** 成员在当前协作范围内的角色。 */
  roleText: string;
};

/** 当前分区成员列表属性。 */
type AreaMemberListProps = {
  /** 已转换为展示结构的成员列表。 */
  members: AreaMemberViewModel[];
  /** 列表外层附加样式。 */
  className?: string;
};

/** 在桌面端右侧上下文栏常驻展示当前分区成员。 */
export function ProjectCurrentAreaMembersCard(props: ProjectCurrentAreaMembersProps) {
  const members = resolveAreaMembers(props);
  const AreaIcon = props.area.type === 'PRIVATE' ? LockKeyhole : UsersRound;

  return (
    <section className="border-t border-black/8 px-4 py-4" aria-labelledby="current-area-members-title">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#f5bf19]/22 text-[#6d5300]">
          <AreaIcon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-[0.1em] text-black/72">当前分区</p>
          <h3 id="current-area-members-title" className="mt-0.5 truncate text-xs font-semibold">
            {props.area.name}
          </h3>
        </div>
        <span className="shrink-0 rounded-full border border-black/[0.2] bg-white/60 px-2 py-0.5 text-[10px] text-black/72">
          {members.length} 人
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-4 text-black/72">
        {props.area.type === 'PUBLIC' ? '公共分区，继承项目全部成员。' : '私有分区，仅以下成员可以参与。'}
      </p>
      <AreaMemberList members={members} className="mt-3" />
    </section>
  );
}

/** 在移动端聊天头部提供当前分区成员抽屉入口。 */
export function ProjectCurrentAreaMembersSheet(props: ProjectCurrentAreaMembersProps) {
  const members = resolveAreaMembers(props);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-black/10 bg-white/55 px-2.5 text-[10px] shadow-none lg:hidden"
        >
          <UsersRound className="size-3.5" aria-hidden />
          {members.length}
          <span className="sr-only">查看分区成员</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[78dvh] rounded-t-[1.5rem] border-black/10 bg-[#f8f7f2] px-5 pb-6">
        <SheetHeader className="border-b border-black/[0.07] px-0 py-5 text-left">
          <SheetTitle className="text-lg font-semibold tracking-[-0.02em]">{props.area.name}</SheetTitle>
          <SheetDescription className="text-xs text-black/48">
            {props.area.type === 'PUBLIC'
              ? `公共分区 · ${members.length} 位项目成员`
              : `私有分区 · ${members.length} 位分区成员`}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AreaMemberList members={members} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** 以紧凑头像行展示当前分区的完整成员列表。 */
function AreaMemberList({ members, className = '' }: AreaMemberListProps) {
  if (!members.length) {
    return (
      <p className={`${className} rounded-2xl border border-dashed border-black/10 px-3 py-5 text-center text-[10px] text-black/40`}>
        该分区暂时没有成员。
      </p>
    );
  }

  return (
    <ul className={`${className} space-y-1.5`}>
      {members.map((member) => (
        <li key={member.id} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/52 px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">{member.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{member.name}</span>
          <span className="shrink-0 text-[10px] text-black/72">{member.roleText}</span>
        </li>
      ))}
    </ul>
  );
}

/** 将公共分区项目成员或私有分区成员转换为统一展示结构。 */
function resolveAreaMembers({
  area,
  projectMembers,
  privateAreaMembers,
}: ProjectCurrentAreaMembersProps): AreaMemberViewModel[] {
  if (area.type === 'PUBLIC') {
    return projectMembers.map((member) => ({
      id: member.id,
      name: member.user.name || `用户 ${member.user.id}`,
      avatarUrl: member.user.avatarUrl,
      roleText: getProjectRoleText(member.role),
    }));
  }

  return privateAreaMembers.map((member) => ({
    id: member.id,
    name: member.user.name || `用户 ${member.user.id}`,
    avatarUrl: member.user.avatarUrl,
    roleText: member.role === 'MANAGER' ? '分区管理员' : '分区成员',
  }));
}

/** 返回项目角色在公共分区中的中文说明。 */
function getProjectRoleText(role: ProjectMember['role']): string {
  return { OWNER: '负责人', MANAGER: '管理员', MEMBER: '成员', VIEWER: '只读' }[role];
}
