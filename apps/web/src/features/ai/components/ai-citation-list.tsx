/** 本文件渲染 AI 回答的真实引用状态；2.6-B 尚未接入 Citation 数据。 */

/**
 * 渲染真实引用数据暂不可用时的中性空状态。
 *
 * 不接收或生成网页 Mock 来源，避免把 `/api/chat` 的临时工具结果伪装成持久化引用。
 */
export function AiCitationList() {
  return (
    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground" aria-label="引用来源">
      <span>引用来源</span>
      <span>暂无可展示的引用</span>
    </div>
  );
}
