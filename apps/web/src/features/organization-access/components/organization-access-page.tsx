/**
 * 本文件组合新版组织与权限一级页面的 URL 分区导航和真实业务区域。
 */
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Building2, FileClock, KeyRound, ShieldCheck, UsersRound } from 'lucide-react';
import type {
  AccessAuditListResult,
  AccessDepartmentTreeNode,
  AccessPermission,
  AccessRole,
  AccessUserListResult,
} from '@workspace/contracts/access';

import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import type { OrganizationCapabilities, OrganizationPageQuery } from '../types/organization-access.types';
import { AuditWorkspace } from './audit-workspace';
import { DepartmentWorkspace } from './department-workspace';
import { MemberDirectory } from './member-directory';
import { PermissionDirectory } from './permission-directory';
import { RoleWorkspace } from './role-workspace';

/** 页面按权限和当前分区按需加载的数据。 */
export type OrganizationAccessPageData = {
  /** 分页成员摘要。 */
  users?: AccessUserListResult;
  /** 部门树。 */
  departments?: AccessDepartmentTreeNode[];
  /** 角色与范围授权。 */
  roles?: AccessRole[];
  /** 只读权限目录。 */
  permissions?: AccessPermission[];
  /** 分页访问控制审计。 */
  audit?: AccessAuditListResult;
};

/** 新版组织与权限页面属性。 */
type OrganizationAccessPageProps = {
  /** 当前 URL 查询状态。 */
  query: OrganizationPageQuery;
  /** 当前分区按需读取的数据。 */
  data: OrganizationAccessPageData;
  /** 当前操作者页面能力。 */
  capabilities: OrganizationCapabilities;
};

/** 一级分区元数据。 */
const sections = [
  { value: 'members', label: '成员', icon: UsersRound, capability: 'canReadUsers' },
  { value: 'departments', label: '部门', icon: Building2, capability: 'canReadDepartments' },
  { value: 'roles', label: '角色', icon: KeyRound, capability: 'canReadRoles' },
  { value: 'permissions', label: '权限目录', icon: ShieldCheck, capability: 'canReadPermissions' },
  { value: 'audit', label: '授权审计', icon: FileClock, capability: 'canReadAudit' },
] as const;

/** 组合新版组织与权限页面。 */
export function OrganizationAccessPage({ query, data, capabilities }: OrganizationAccessPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const visibleSections = sections.filter((section) => capabilities[section.capability]);

  /** 切换一级分区并清理上一分区的筛选参数。 */
  function handleSectionChange(value: string): void {
    router.push(`${pathname}?section=${value}`);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5 py-7 sm:py-9 lg:h-full lg:overflow-hidden lg:py-6" aria-label="组织与权限">
      {/* <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-medium tracking-[0.2em] text-muted-foreground">ORGANIZATION & ACCESS</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">组织与权限</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">从部门归属到角色、权限码与数据范围，查看每一项访问能力如何生效。</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm"><span className="size-2 rounded-full bg-organization-accent" aria-hidden />权限实时生效 · 后端强制校验</div>
      </header> */}

      <Tabs value={query.section} onValueChange={handleSectionChange} className="min-h-0 flex-1 gap-5 lg:overflow-hidden">
        <TabsList variant="line" className="h-auto max-w-full justify-start gap-1 overflow-x-auto p-0">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return <TabsTrigger key={section.value} value={section.value} className="h-10 flex-none rounded-xl border px-4 data-[state=active]:border-organization-accent data-[state=active]:bg-organization-accent-soft"><Icon aria-hidden />{section.label}</TabsTrigger>;
          })}
        </TabsList>
        <div className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {renderSection(query, data, capabilities)}
        </div>
      </Tabs>
    </section>
  );
}

/** 根据当前分区渲染已经按需加载的数据区域。 */
function renderSection(query: OrganizationPageQuery, data: OrganizationAccessPageData, capabilities: OrganizationCapabilities) {
  if (query.section === 'members' && data.users) return <MemberDirectory query={query} users={data.users} departments={data.departments ?? []} roles={data.roles ?? []} permissions={data.permissions ?? []} capabilities={capabilities} />;
  if (query.section === 'departments') return <DepartmentWorkspace departments={data.departments ?? []} capabilities={capabilities} />;
  if (query.section === 'roles') return <RoleWorkspace roles={data.roles ?? []} permissions={data.permissions ?? []} capabilities={capabilities} />;
  if (query.section === 'permissions') return <PermissionDirectory permissions={data.permissions ?? []} />;
  if (query.section === 'audit' && data.audit) return <AuditWorkspace query={query} audit={data.audit} capabilities={capabilities} />;
  return <p className="rounded-[1.75rem] border border-dashed bg-organization-surface p-10 text-center text-sm text-muted-foreground">当前账号没有查看该区域的权限。</p>;
}

/** 渲染没有任何组织读取权限的一级页面状态。 */
export function OrganizationAccessForbidden() {
  return <section className="grid flex-1 place-items-center py-12"><div className="max-w-md rounded-[1.75rem] border bg-organization-surface p-8 text-center"><ShieldCheck className="mx-auto size-10 text-muted-foreground" aria-hidden /><h1 className="mt-4 text-xl font-semibold">没有组织与权限查看能力</h1><p className="mt-2 text-sm text-muted-foreground">请联系管理员为当前账号分配成员、部门、角色、权限目录或授权审计的读取权限。</p></div></section>;
}
