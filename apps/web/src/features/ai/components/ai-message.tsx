/**
 * 本文件统一渲染实时流与历史恢复中的用户纯文本和助手安全 Markdown 消息。
 */
'use client';

import type { ComponentProps } from 'react';
import type { Components } from 'streamdown';
import { Bot, UserRound } from 'lucide-react';

import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';

import { isSafeAiMarkdownUrl } from '../utils/ai-markdown-security';

export { isSafeAiMarkdownUrl } from '../utils/ai-markdown-security';

/** Streamdown 的索引签名比原生标签属性更宽，这里只注册两个受控渲染器。 */
const safeMarkdownComponents = {
  a: SafeMarkdownLink,
  img: DisabledMarkdownImage,
} as unknown as Components;

/** AI 时间流中的文本消息属性。 */
export type AiMessageProps = {
  /** 消息稳定标识，用于无障碍标签关联。 */
  id: string;
  /** 用户消息保持纯文本，助手消息使用安全 Markdown。 */
  role: 'user' | 'assistant';
  /** 当前已经产生或从数据库恢复的完整正文。 */
  content: string;
  /** 助手消息是否仍处于流式增量阶段。 */
  streaming?: boolean;
};

/** 使用同一套结构展示首次流和历史恢复的文本消息。 */
export function AiMessage({ id, role, content, streaming = false }: AiMessageProps) {
  const senderLabel = role === 'user' ? '你' : '决策过程 AI';

  return (
    <article aria-labelledby={`${id}-sender`} className="min-w-0" data-message-id={id}>
      <Message from={role}>
        <header
          id={`${id}-sender`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          {role === 'user' ? (
            <UserRound aria-hidden className="size-3.5" />
          ) : (
            <Bot aria-hidden className="size-3.5" />
          )}
          {senderLabel}
        </header>
        <MessageContent className="min-w-0">
          {role === 'user' ? (
            <p className="whitespace-pre-wrap break-words leading-6">{content}</p>
          ) : (
            <MessageResponse
              className="min-w-0 max-w-full break-words leading-7 [&_a]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
              components={safeMarkdownComponents}
              isAnimating={streaming}
              linkSafety={{ enabled: true }}
              mode={streaming ? 'streaming' : 'static'}
              parseIncompleteMarkdown
              skipHtml
            >
              {content}
            </MessageResponse>
          )}
        </MessageContent>
      </Message>
    </article>
  );
}

/** 为 Markdown 链接补充协议白名单与安全的新窗口策略。 */
function SafeMarkdownLink({ href, children, ...props }: ComponentProps<'a'>) {
  if (!href || !isSafeAiMarkdownUrl(href)) {
    return <span className="break-all text-muted-foreground">{children}</span>;
  }

  const opensNewContext = /^https?:\/\//i.test(href) || /^mailto:/i.test(href);

  return (
    <a
      {...props}
      href={href}
      rel={opensNewContext ? 'noopener noreferrer' : undefined}
      target={opensNewContext ? '_blank' : undefined}
    >
      {children}
    </a>
  );
}

/** 第一版 Decision Agent 不展示模型生成图片，避免不受信任资源进入消息区。 */
function DisabledMarkdownImage() {
  return <span className="text-xs text-muted-foreground">[图片已隐藏]</span>;
}
