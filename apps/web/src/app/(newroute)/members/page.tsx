/**
 * 本文件提供新版一级组织与权限路由，并按当前分区按需读取真实业务数据。
 */
import { redirect } from 'next/navigation';

import { requireReadyUser } from '@/features/auth/services/auth-server.service';
import {
  OrganizationAccessForbidden,
  OrganizationAccessPage,
  type OrganizationAccessPageData,
} from '@/features/organization-access/components/organization-access-page';
import {
  getOrganizationAudit,
  getOrganizationDepartments,
  getOrganizationPermissions,
  getOrganizationRoles,
  getOrganizationUsers,
} from '@/features/organization-access/services/organization-access-server.service';
import { buildOrganizationCapabilities } from '@/features/organization-access/utils/organization-capabilities';
import {
  parseOrganizationPageQuery,
  type OrganizationSearchParams,
} from '@/features/organization-access/utils/organization-query';

/** 组织与权限路由属性。 */
type MembersPageProps = {
  /** 一级分区、筛选与分页状态。 */
  searchParams: Promise<OrganizationSearchParams>;
};

/** 渲染新版一级组织与权限页面。 */
export default async function MembersPage({ searchParams }: MembersPageProps) {
  const [currentUser, rawQuery] = await Promise.all([requireReadyUser(), searchParams]);
  const capabilities = buildOrganizationCapabilities(currentUser);
  const requestedQuery = parseOrganizationPageQuery(rawQuery);
  const visibleSections = [
    capabilities.canReadUsers ? 'members' : null,
    capabilities.canReadDepartments ? 'departments' : null,
    capabilities.canReadRoles ? 'roles' : null,
    capabilities.canReadPermissions ? 'permissions' : null,
    capabilities.canReadAudit || capabilities.canReadProjectAudit ? 'audit' : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);

  if (visibleSections.length === 0 && !capabilities.canReadProjectAudit) return <OrganizationAccessForbidden />;
  if (!visibleSections.includes(requestedQuery.section) && visibleSections[0]) redirect(`/members?section=${visibleSections[0]}`);

  const query = requestedQuery;
  const data: OrganizationAccessPageData = {};
  if (query.section === 'members') {
    const [users, departments, roles, permissions] = await Promise.all([
      getOrganizationUsers({ keyword: query.keyword, status: query.status, departmentId: query.departmentId, withoutDepartment: query.withoutDepartment, roleId: query.roleId, page: query.page, pageSize: 20 }),
      capabilities.canReadDepartments ? getOrganizationDepartments() : Promise.resolve([]),
      capabilities.canReadRoles ? getOrganizationRoles() : Promise.resolve([]),
      capabilities.canReadPermissions ? getOrganizationPermissions() : Promise.resolve([]),
    ]);
    Object.assign(data, { users, departments, roles, permissions });
  } else if (query.section === 'departments') {
    data.departments = await getOrganizationDepartments();
  } else if (query.section === 'roles') {
    [data.roles, data.permissions] = await Promise.all([
      getOrganizationRoles(),
      capabilities.canReadPermissions ? getOrganizationPermissions() : Promise.resolve([]),
    ]);
  } else if (query.section === 'permissions') {
    data.permissions = await getOrganizationPermissions();
  } else if (query.section === 'audit') {
    data.audit = capabilities.canReadAudit
      ? await getOrganizationAudit({ action: query.auditAction, targetType: query.auditTargetType, page: query.page, pageSize: 20 })
      : { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  return <OrganizationAccessPage query={query} data={data} capabilities={capabilities} />;
}
