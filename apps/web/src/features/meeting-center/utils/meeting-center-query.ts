/**
 * 本文件负责会议中心 URL 查询状态和 Asia/Shanghai 周边界的纯函数转换。
 */
import type {
  MeetingCenterOverviewQuery,
  MeetingCenterRecordsQuery,
  MeetingCenterRecordStatus,
  MeetingParticipantRole,
} from '@workspace/contracts/meetings';

import type { MeetingCenterPageQuery } from '../types/meeting-center.types';

/** Asia/Shanghai 固定 UTC 偏移毫秒数。 */
const SHANGHAI_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;
/** 页面接受的角色集合。 */
const MEETING_ROLES: MeetingParticipantRole[] = ['HOST', 'CO_HOST', 'ATTENDEE'];
/** 页面接受的历史状态集合。 */
const RECORD_STATUSES: MeetingCenterRecordStatus[] = ['ENDED', 'CANCELLED', 'EXPIRED'];

/** Next.js 页面传入的原始 searchParams。 */
export type MeetingCenterSearchParams = Record<string, string | string[] | undefined>;

/** 将不可信 URL 参数收敛为页面可用的查询状态。 */
export function parseMeetingCenterPageQuery(
  searchParams: MeetingCenterSearchParams,
  now = new Date(),
): MeetingCenterPageQuery {
  const view = readSingle(searchParams.view) === 'records' ? 'records' : 'schedule';
  const dateValue = readSingle(searchParams.date);
  const roleValue = readSingle(searchParams.role) as MeetingParticipantRole | undefined;
  const statusValue = readSingle(searchParams.status) as MeetingCenterRecordStatus | undefined;
  const projectId = parsePositiveInteger(readSingle(searchParams.projectId));
  const meetingId = parsePositiveInteger(readSingle(searchParams.meetingId));
  const page = parsePositiveInteger(readSingle(searchParams.page)) ?? 1;
  const keyword = readSingle(searchParams.keyword)?.trim().slice(0, 80) || undefined;
  const fromValue = readSingle(searchParams.from);
  const toValue = readSingle(searchParams.to);

  return {
    meetingId,
    view,
    date: isDateKey(dateValue) ? dateValue : formatShanghaiDate(now),
    projectId,
    role: roleValue && MEETING_ROLES.includes(roleValue) ? roleValue : undefined,
    status: statusValue && RECORD_STATUSES.includes(statusValue) ? statusValue : undefined,
    keyword,
    from: isDateKey(fromValue) ? fromValue : undefined,
    to: isDateKey(toValue) ? toValue : undefined,
    page,
  };
}

/** 构造会议中心周日程接口查询条件。 */
export function createOverviewQuery(query: MeetingCenterPageQuery): MeetingCenterOverviewQuery {
  const { from, to } = getShanghaiWeekRange(query.date);
  return { from, to, projectId: query.projectId, role: query.role };
}

/** 构造会议中心历史记录接口查询条件。 */
export function createRecordsQuery(query: MeetingCenterPageQuery): MeetingCenterRecordsQuery {
  return {
    keyword: query.keyword,
    projectId: query.projectId,
    role: query.role,
    status: query.status,
    from: query.from && query.to ? shanghaiDateBoundaryToUtc(query.from) : undefined,
    to: query.from && query.to ? shanghaiDateBoundaryToUtc(shiftDateKey(query.to, 1)) : undefined,
    page: query.page,
    pageSize: 20,
  };
}

/** 将 UTC+8 日期零点转换为 UTC ISO 时间。 */
function shanghaiDateBoundaryToUtc(dateKey: string): string {
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() - SHANGHAI_OFFSET_MILLISECONDS).toISOString();
}

/** 移动公历日期键。 */
function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 获取给定 UTC+8 日期所在的周一到下周一 UTC 边界。 */
export function getShanghaiWeekRange(dateKey: string): { from: string; to: string } {
  const localMidnight = new Date(`${dateKey}T00:00:00.000Z`);
  const monday = new Date(localMidnight);
  const daysSinceMonday = (localMidnight.getUTCDay() + 6) % 7;
  monday.setUTCDate(localMidnight.getUTCDate() - daysSinceMonday);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  return {
    from: new Date(monday.getTime() - SHANGHAI_OFFSET_MILLISECONDS).toISOString(),
    to: new Date(nextMonday.getTime() - SHANGHAI_OFFSET_MILLISECONDS).toISOString(),
  };
}

/** 将任意时间格式化为 UTC+8 的 YYYY-MM-DD。 */
export function formatShanghaiDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

/** 从可能重复的查询参数中读取首项。 */
function readSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 解析严格正整数。 */
function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** 判断字符串是否是有效的公历日期键。 */
function isDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
}
