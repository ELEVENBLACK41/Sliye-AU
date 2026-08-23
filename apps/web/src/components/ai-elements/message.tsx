/**
 * 本文件由 AI Elements message 组件裁剪并适配 NextNest，统一承载流式 Markdown 消息。
 */
'use client';

import type { HTMLAttributes } from 'react';
import { memo } from 'react';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import type { UIMessage } from 'ai';
import { Streamdown, type PluginConfig, type StreamdownProps } from 'streamdown';

import { cn } from '@workspace/ui/lib/utils';

/** AI Elements 消息容器属性。 */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  /** 决定用户与助手消息的布局语义。 */
  from: UIMessage['role'];
};

/** 根据消息角色提供统一的宽度和对齐方式。 */
export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        'group flex w-full max-w-[95%] flex-col gap-2',
        from === 'user' ? 'is-user ml-auto items-end' : 'is-assistant',
        className,
      )}
      {...props}
    />
  );
}

/** AI Elements 消息正文容器属性。 */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/** 统一用户气泡和助手正文的尺寸、溢出与语义色。 */
export function MessageContent({ children, className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        'flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm',
        'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
        'group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Streamdown 插件保持首次流和历史恢复的 Markdown 能力一致。 */
const streamdownPlugins: PluginConfig = {
  cjk,
  code: code as unknown as PluginConfig['code'],
};

/** 比较两次 Markdown 渲染输入，避免无关状态导致昂贵重绘。 */
function areMessageResponsesEqual(previous: StreamdownProps, next: StreamdownProps): boolean {
  return previous.children === next.children && previous.isAnimating === next.isAnimating;
}

/** 使用 AI Elements 的 Streamdown 渲染支持未闭合语法的安全流式 Markdown。 */
export const MessageResponse = memo(function MessageResponse({ className, ...props }: StreamdownProps) {
  return (
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      plugins={streamdownPlugins}
      {...props}
    />
  );
}, areMessageResponsesEqual);
