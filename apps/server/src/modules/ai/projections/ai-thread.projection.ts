/**
 * 本文件集中定义 Thread 对外列表项的字段投影与转换。
 *
 * 列表、详情和固定列表返回同一组会话元数据，投影写在一处可以保证三个接口
 * 不会因为各自维护字段清单而出现差异，也避免某个接口悄悄多返回内部字段。
 */

/** 列表、详情与固定列表共用的会话字段投影。 */
export const AI_THREAD_LIST_ITEM_SELECT = {
  id: true,
  title: true,
  activeRunId: true,
  pinnedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** 已投影的会话行，用于在服务内部转换为对外契约。 */
export type AiThreadRow = {
  id: string;
  title: string;
  activeRunId: string | null;
  pinnedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 把数据库行转换为对外契约；时间统一为 ISO 8601 字符串。 */
export function toAiThreadListItem(row: AiThreadRow) {
  return {
    id: row.id,
    title: row.title,
    activeRunId: row.activeRunId,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
