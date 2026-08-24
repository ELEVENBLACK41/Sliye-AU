/**
 * 本文件展示历史回答、工具结果或引用因来源失权/删除而不可见的中性占位。
 */

import type { AiHistoryContentHiddenReason } from '@workspace/contracts/ai';
import { ShieldAlert } from 'lucide-react';

/** 历史隐藏占位属性。 */
type AiHistoryHiddenNoticeProps = {
  /** 被隐藏内容的业务部件类型。 */
  contentKind: 'answer' | 'tool' | 'citations';
  /** 服务端重新鉴权后返回的稳定隐藏原因。 */
  reason: AiHistoryContentHiddenReason;
};

/** 返回不包含旧业务正文和来源标识的用户提示。 */
function getHiddenNoticeText(
  contentKind: AiHistoryHiddenNoticeProps['contentKind'],
  reason: AiHistoryContentHiddenReason,
): string {
  const label = contentKind === 'answer' ? '这条助手回答' : contentKind === 'tool' ? '这项工具结果' : '这组引用';

  return reason === 'SOURCE_DELETED'
    ? `${label}依赖的来源已删除，内容已隐藏。`
    : `${label}依赖的来源当前无权访问，内容已隐藏。`;
}

/** 渲染可被读屏识别、不会泄漏旧内容的历史隐藏占位。 */
export function AiHistoryHiddenNotice({ contentKind, reason }: AiHistoryHiddenNoticeProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-sm text-muted-foreground"
    >
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{getHiddenNoticeText(contentKind, reason)}</span>
    </div>
  );
}
