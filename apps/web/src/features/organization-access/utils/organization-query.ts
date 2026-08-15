/**
 * 本文件负责把不可信 URL 参数解析为组织与权限页面查询状态。
 */
import type {
  AccessAuditAction,
  AccessAuditTargetType,
  AccessUserStatus,
} from '@workspace/contracts/access';

import type { OrganizationPageQuery, OrganizationSection } from '../types/organization-access.types';

/** Next.js 页面接收的原始查询参数。 */
export type OrganizationSearchParams = Record<string, string | string[] | undefined>;

/** 页面支持的分区。 */
const sections: OrganizationSection[] = ['members', 'departments', 'roles', 'permissions', 'audit'];
/** 页面支持的成员状态。 */
const statuses: AccessUserStatus[] = ['PENDING', 'ACTIVE', 'DISABLED', 'LOCKED'];
/** 页面支持的审计目标类型。 */
const auditTargetTypes: AccessAuditTargetType[] = ['DEPARTMENT', 'ROLE', 'PERMISSION', 'USER', 'SYSTEM'];

/** 将 URL 参数收敛为页面可直接使用的查询状态。 */
export function parseOrganizationPageQuery(searchParams: OrganizationSearchParams): OrganizationPageQuery {
  const sectionValue = readSingle(searchParams.section) as OrganizationSection | undefined;
  const statusValue = readSingle(searchParams.status) as AccessUserStatus | undefined;
  const auditTargetType = readSingle(searchParams.targetType) as AccessAuditTargetType | undefined;
  const keyword = readSingle(searchParams.keyword)?.trim().slice(0, 80) || undefined;

  return {
    section: sectionValue && sections.includes(sectionValue) ? sectionValue : 'members',
    keyword,
    status: statusValue && statuses.includes(statusValue) ? statusValue : undefined,
    departmentId: parsePositiveInteger(readSingle(searchParams.departmentId)),
    withoutDepartment: readSingle(searchParams.withoutDepartment) === 'true' || undefined,
    roleId: parsePositiveInteger(readSingle(searchParams.roleId)),
    auditAction: readSingle(searchParams.action) as AccessAuditAction | undefined,
    auditTargetType: auditTargetType && auditTargetTypes.includes(auditTargetType) ? auditTargetType : undefined,
    page: parsePositiveInteger(readSingle(searchParams.page)) ?? 1,
  };
}

/** 从可能重复的查询参数中读取第一项。 */
function readSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 将字符串解析为安全正整数。 */
function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
