/**
 * 本文件由 AI Elements sources 组件裁剪并适配 NextNest，用于展示稳定业务来源。
 */
'use client';

import type { ComponentProps } from 'react';
import { BookIcon, ChevronDownIcon } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible';
import { cn } from '@workspace/ui/lib/utils';

/** AI Elements 来源容器属性。 */
export type SourcesProps = ComponentProps<typeof Collapsible>;

/** 渲染可展开的来源列表容器。 */
export function Sources({ className, ...props }: SourcesProps) {
  return <Collapsible className={cn('group not-prose mb-4 text-xs text-primary', className)} {...props} />;
}

/** 来源展开触发器属性。 */
export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  /** 当前稳定来源数量。 */
  count: number;
};

/** 渲染来源数量和展开指示器。 */
export function SourcesTrigger({ className, count, children, ...props }: SourcesTriggerProps) {
  return (
    <CollapsibleTrigger className={cn('flex items-center gap-2', className)} {...props}>
      {children ?? (
        <>
          <span className="font-medium">引用 {count} 个来源</span>
          <ChevronDownIcon
            aria-hidden
            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </>
      )}
    </CollapsibleTrigger>
  );
}

/** 来源展开正文属性。 */
export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

/** 渲染带减少动画偏好兼容的来源列表。 */
export function SourcesContent({ className, ...props }: SourcesContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'mt-3 flex w-fit flex-col gap-2 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

/** 单个可定位来源链接属性。 */
export type SourceProps = ComponentProps<'a'>;

/** 渲染一个来源链接；调用方负责提供经过权限校验的站内地址。 */
export function Source({ href, title, children, className, ...props }: SourceProps) {
  return (
    <a className={cn('flex items-center gap-2', className)} href={href} title={title} {...props}>
      {children ?? (
        <>
          <BookIcon aria-hidden className="size-4" />
          <span className="block font-medium">{title}</span>
        </>
      )}
    </a>
  );
}
