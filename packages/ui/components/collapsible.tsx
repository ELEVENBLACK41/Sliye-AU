/**
 * 本文件由 shadcn/ui CLI 安装，提供可访问的可折叠内容基础组件。
 */
'use client';

import { Collapsible as CollapsiblePrimitive } from 'radix-ui';

/** 渲染并管理可折叠区域的展开状态。 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/** 渲染可通过鼠标和键盘切换展开状态的触发器。 */
function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

/** 渲染随根状态显示或隐藏的可折叠内容。 */
function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
