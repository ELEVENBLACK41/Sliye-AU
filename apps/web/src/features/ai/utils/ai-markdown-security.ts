/**
 * 本文件集中定义 AI 助手 Markdown 链接的协议白名单，供实时流与历史恢复统一使用。
 */

/** 仅允许站内绝对路径、锚点、HTTP(S) 和邮件协议，拒绝协议相对地址。 */
export function isSafeAiMarkdownUrl(href: string): boolean {
  const normalized = href.trim();

  if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return false;
  }

  return (
    (normalized.startsWith('/') && !normalized.startsWith('//') && !normalized.includes('\\')) ||
    normalized.startsWith('#') ||
    /^https?:\/\//i.test(normalized) ||
    /^mailto:/i.test(normalized)
  );
}
