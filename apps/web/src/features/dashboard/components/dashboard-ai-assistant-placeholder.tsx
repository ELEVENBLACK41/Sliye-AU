/**
 * 本文件展示新版工作台的毛玻璃 AI 决策助手卡片，并控制卡片在原位与屏幕中央之间实时缩放移动。
 */
'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { Maximize2, Minimize2, Send, Zap } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';

/** AI 卡片在普通与放大状态下共用的完整外观，确保动画过程中样式不发生切换。 */
const aiAssistantCardClassName =
  'relative h-full min-h-[20rem] gap-0 overflow-hidden rounded-[1.75rem] border border-white/50 bg-transparent bg-[linear-gradient(to_bottom,rgba(247,244,193,0.09)_0%,rgba(255,241,132,0.18)_50%,rgba(255,224,68,0.3)_100%)] py-0 text-[#252622] shadow-[0_24px_48px_rgba(112,89,11,0.08),inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-[8px] backdrop-saturate-125 xl:min-h-0 xl:[container-type:size]';

/** 动画计算所需的卡片视口矩形。 */
type AssistantCardRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;

/** AI 卡片内部内容属性。 */
type AssistantCardContentProps = {
  /** 放大或缩小按钮引用。 */
  actionButtonRef: RefObject<HTMLButtonElement | null>;
  /** 当前输入草稿。 */
  draft: string;
  /** 当前是否处于放大状态。 */
  expanded: boolean;
  /** 输入内容变化回调。 */
  onDraftChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** 切换卡片尺寸状态。 */
  onToggle: () => void;
};

/** 把 DOMRect 转换为不会随 DOM 变化的普通对象。 */
function copyCardRect(rect: DOMRect): AssistantCardRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

/** 根据视口尺寸计算卡片放大后的居中位置。 */
function getExpandedCardRect(): AssistantCardRect {
  const isMobile = window.innerWidth < 768;
  const horizontalMargin = isMobile ? 16 : 32;
  const verticalMargin = isMobile ? 16 : 32;
  const availableWidth = window.innerWidth - horizontalMargin * 2;
  const availableHeight = window.innerHeight - verticalMargin * 2;
  const width = isMobile ? availableWidth : Math.min(window.innerWidth * 0.7, 1040, availableWidth);
  const height = isMobile ? availableHeight : Math.min(window.innerHeight * 0.8, 760, availableHeight);

  return {
    height,
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
    width,
  };
}

/** 渲染普通卡片和放大卡片完全相同的内部结构。 */
function AssistantCardContent({
  actionButtonRef,
  draft,
  expanded,
  onDraftChange,
  onToggle,
}: AssistantCardContentProps) {
  return (
    <section
      className="relative flex h-full min-h-[20rem] flex-col overflow-hidden rounded-[inherit] px-6 pt-6 pb-5 xl:min-h-0 xl:px-[clamp(1rem,calc(2.6cqh+0.585rem),1.5rem)] xl:pt-[clamp(1rem,calc(2.6cqh+0.585rem),1.5rem)] xl:pb-[clamp(0.75rem,calc(2.2cqh+0.495rem),1.25rem)]"
      aria-labelledby="dashboard-ai-assistant-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(255,255,255,0.16),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_48%,rgba(255,220,74,0.035)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
        aria-hidden
      />

      <header className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#171813] text-white shadow-[0_5px_12px_rgba(32,31,18,0.18)] xl:size-[clamp(2rem,calc(4cqh+0.9rem),2.25rem)]">
            <Zap className="size-4 fill-current" aria-hidden />
          </span>
          <h2 id="dashboard-ai-assistant-title" className="truncate text-sm font-semibold text-[#292a27]">
            AI 决策助手
          </h2>
        </div>

        <Button
          ref={actionButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="size-10 rounded-2xl border border-white/75 bg-[#f4f4f1]/80 text-[#343532] shadow-[0_8px_20px_rgba(41,42,39,0.08)] backdrop-blur-md hover:bg-[#fafaf8]/90 xl:size-[clamp(2rem,calc(4.5cqh+1.0125rem),2.5rem)]"
          aria-label={expanded ? '缩小 AI 决策助手' : '放大 AI 决策助手'}
        >
          {expanded ? (
            <Minimize2 className="size-4" aria-hidden />
          ) : (
            <Maximize2 className="size-4" aria-hidden />
          )}
        </Button>
      </header>

      <div className="relative flex flex-1 flex-col justify-end pt-14 pb-7 xl:pt-[clamp(1rem,calc(6cqh+1.35rem),3.5rem)] xl:pb-[clamp(0.75rem,calc(3cqh+0.675rem),1.75rem)]">
        <p className="max-w-[16rem] text-[1.55rem] leading-[1.16] font-normal tracking-[-0.045em] text-[#292a27] xl:text-[clamp(1.25rem,calc(2.6cqh+0.585rem),1.55rem)]">
          今天有哪些决策
          <br />
          <strong className="font-semibold">需要我关注？</strong>
        </p>
      </div>

      <footer className="relative flex items-center gap-2 rounded-2xl border border-white/75 bg-[#f4f4f1]/80 p-1.5 shadow-[0_10px_24px_rgba(41,42,39,0.08)] backdrop-blur-md">
        <Input
          type="text"
          value={draft}
          onChange={onDraftChange}
          placeholder="输入你想了解的内容…"
          aria-label="输入 AI 对话内容"
          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-[#343532] shadow-none placeholder:text-[#777873] focus-visible:ring-0"
        />
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-xl bg-[#171813] text-white shadow-[0_8px_18px_rgba(24,24,20,0.2)] hover:bg-black"
          aria-label="发送 AI 对话内容"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </footer>
    </section>
  );
}

/** 渲染能从工作台原位实时放大、并实时缩回原位的 AI 决策助手卡片。 */
export function DashboardAiAssistantPlaceholder() {
  const [draft, setDraft] = useState('');
  const [expandedRect, setExpandedRect] = useState<AssistantCardRect | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const collapsedButtonRef = useRef<HTMLButtonElement | null>(null);
  const expandedButtonRef = useRef<HTMLButtonElement | null>(null);
  const floatingCardRef = useRef<HTMLDivElement | null>(null);
  const originRectRef = useRef<AssistantCardRect | null>(null);
  const isAnimatingRef = useRef(false);

  /** 保存输入草稿，避免卡片改变挂载位置时丢失内容。 */
  function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
  }

  /** 测量原卡片并挂载用于移动的同款浮动卡片。 */
  function handleExpand() {
    const anchor = anchorRef.current;
    if (!anchor || isAnimatingRef.current) return;

    originRectRef.current = copyCardRect(anchor.getBoundingClientRect());
    setExpandedRect(getExpandedCardRect());
    setIsExpanded(true);
  }

  /** 缩回完成后恢复原卡片与放大按钮焦点。 */
  const finishCollapse = useCallback(() => {
    isAnimatingRef.current = false;
    setIsExpanded(false);
    setExpandedRect(null);
    window.requestAnimationFrame(() => collapsedButtonRef.current?.focus());
  }, []);

  /** 实时修改卡片宽高与坐标，使其缩回当前占位区域。 */
  const handleCollapse = useCallback(() => {
    const anchor = anchorRef.current;
    const floatingCard = floatingCardRef.current;
    if (!anchor || !floatingCard || isAnimatingRef.current) return;

    const originRect = copyCardRect(anchor.getBoundingClientRect());
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    isAnimatingRef.current = true;
    gsap.killTweensOf(floatingCard);
    gsap.to(floatingCard, {
      height: originRect.height,
      left: originRect.left,
      top: originRect.top,
      width: originRect.width,
      duration: reduceMotion ? 0.01 : 0.68,
      ease: 'power4.inOut',
      onComplete: finishCollapse,
    });
  }, [finishCollapse]);

  /** 仅在点击卡片以外的透明区域时触发缩回。 */
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) handleCollapse();
  }

  /** 浮动卡片挂载后，实时修改其宽高与坐标完成原位到居中的移动。 */
  useLayoutEffect(() => {
    const floatingCard = floatingCardRef.current;
    const originRect = originRectRef.current;
    if (!isExpanded || !expandedRect || !floatingCard || !originRect) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    isAnimatingRef.current = true;
    gsap.fromTo(
      floatingCard,
      {
        height: originRect.height,
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
      },
      {
        height: expandedRect.height,
        left: expandedRect.left,
        top: expandedRect.top,
        width: expandedRect.width,
        duration: reduceMotion ? 0.01 : 0.68,
        ease: 'power4.inOut',
        onComplete: () => {
          isAnimatingRef.current = false;
          expandedButtonRef.current?.focus();
        },
      },
    );

    return () => {
      gsap.killTweensOf(floatingCard);
    };
  }, [expandedRect, isExpanded]);

  /** 放大期间锁定页面滚动，并支持按 Escape 实时缩回。 */
  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /** 复用缩回动画处理 Escape 按键。 */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleCollapse();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCollapse, isExpanded]);

  const floatingCardStyle: CSSProperties | undefined = expandedRect
    ? {
        height: expandedRect.height,
        left: expandedRect.left,
        top: expandedRect.top,
        width: expandedRect.width,
      }
    : undefined;

  return (
    <>
      {isExpanded ? (
        <div ref={anchorRef} className="h-full" aria-hidden />
      ) : (
        <Card ref={anchorRef} aria-label="AI 决策助手" className={aiAssistantCardClassName}>
          <AssistantCardContent
            actionButtonRef={collapsedButtonRef}
            draft={draft}
            expanded={false}
            onDraftChange={handleDraftChange}
            onToggle={handleExpand}
          />
        </Card>
      )}

      {isExpanded && expandedRect
        ? createPortal(
            <div
              role="presentation"
              onMouseDown={handleBackdropClick}
              className="fixed inset-0 z-[60] bg-transparent"
            >
              <Card
                ref={floatingCardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-ai-assistant-title"
                style={floatingCardStyle}
                className={`fixed will-change-[top,left,width,height] ${aiAssistantCardClassName}`}
              >
                <AssistantCardContent
                  actionButtonRef={expandedButtonRef}
                  draft={draft}
                  expanded
                  onDraftChange={handleDraftChange}
                  onToggle={handleCollapse}
                />
              </Card>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
