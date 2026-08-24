/**
 * 本文件定义 AI 工作台侧栏展示所需的本地 UI 类型，不作为跨端契约使用。
 */

/** AI 工作台历史条目的静态展示结构，后续替换为 AI Thread 摘要契约。 */
export type AiWorkspaceThreadPreview = {
  /** 线程稳定标识，后续用于跳转和恢复会话。 */
  id: string;
  /** 用户在侧栏中识别会话的标题。 */
  title: string;
  /** 是否作为当前会话的视觉选中态。 */
  isActive?: boolean;
};

/** AI 工作台本地展示数据边界，真实数据接入时保持布局组件不变。 */
export type AiWorkspaceStaticData = {
  /** 当前展示的用户称呼，后续由认证资料提供。 */
  userName: string;
  /** 可固定在侧栏的决策档案入口。 */
  pinnedThreads: AiWorkspaceThreadPreview[];
  /** 最近创建或访问的 AI 会话。 */
  recentThreads: AiWorkspaceThreadPreview[];
};
