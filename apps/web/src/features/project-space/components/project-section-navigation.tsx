/**
 * 本文件展示项目内部导航，并用滑动选中块衔接讨论、决策与会议模块。
 */
'use client';

import type { MouseEvent } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { CalendarDays, GitBranch, MessageCircle } from 'lucide-react';

import type { ProjectSectionKey } from '../types/project-space.type';
import { Button } from '@workspace/ui/components/button';

/** 项目内部一级导航属性。 */
type ProjectSectionNavigationProps = {
  /** 当前正在展示的项目模块。 */
  activeSection: ProjectSectionKey;
  /** 用户选择项目模块时触发的状态更新。 */
  onSectionChange: (section: ProjectSectionKey) => void;
};

/** 项目内部一级导航的展示配置。 */
const projectSections = [
  { key: 'discussion', label: '讨论', icon: MessageCircle },
  { key: 'decisions', label: '决策', icon: GitBranch },
  { key: 'meetings', label: '会议', icon: CalendarDays },
] satisfies Array<{ key: ProjectSectionKey; label: string; icon: typeof MessageCircle }>;

/** 导航按钮与白色遮罩层共用的尺寸样式。 */
const projectNavigationItemClass =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-transparent px-3 text-xs leading-none font-medium whitespace-nowrap';

/** 渲染带平滑移动选中块的项目内部模块切换入口。 */
export function ProjectSectionNavigation({ activeSection, onSectionChange }: ProjectSectionNavigationProps) {
  const navigationContainerRef = useRef<HTMLUListElement | null>(null);
  const activeSectionRef = useRef<ProjectSectionKey>(activeSection);
  const hasPositionedIndicatorRef = useRef(false);
  const isIndicatorMovingRef = useRef(false);

  /** 测量目标模块，并直接定位或平滑移动黑色选中块。 */
  const moveNavigationIndicator = useCallback(
    (targetSection: ProjectSectionKey, shouldAnimate: boolean, onComplete?: () => void): void => {
      const navigationContainer = navigationContainerRef.current;
      if (!navigationContainer) return;

      const targetItem = navigationContainer.querySelector<HTMLElement>(`[data-section-key="${targetSection}"]`);
      const containerRect = navigationContainer.getBoundingClientRect();
      const targetRect = targetItem?.getBoundingClientRect();
      const indicatorOffset = targetRect ? targetRect.left - containerRect.left + navigationContainer.scrollLeft : 0;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hasMotion = shouldAnimate && !prefersReducedMotion;

      isIndicatorMovingRef.current = hasMotion;
      gsap.to(navigationContainer, {
        '--project-navigation-indicator-x': `${indicatorOffset}px`,
        '--project-navigation-indicator-width': targetItem ? `${targetItem.offsetWidth}px` : '0px',
        '--project-navigation-indicator-opacity': targetItem ? 1 : 0,
        duration: hasMotion ? 0.32 : 0,
        ease: 'power3.out',
        overwrite: 'auto',
        onComplete: () => {
          isIndicatorMovingRef.current = false;
          onComplete?.();
        },
        onInterrupt: () => {
          isIndicatorMovingRef.current = false;
        },
      });
    },
    [],
  );

  /** 外部模块状态变化后同步选中块，兼容后续由路由或其他入口控制 Tab。 */
  useLayoutEffect(() => {
    if (!hasPositionedIndicatorRef.current) {
      activeSectionRef.current = activeSection;
      moveNavigationIndicator(activeSection, false);
      hasPositionedIndicatorRef.current = true;
      return;
    }

    if (activeSectionRef.current === activeSection) return;

    activeSectionRef.current = activeSection;
    moveNavigationIndicator(activeSection, true);
  }, [activeSection, moveNavigationIndicator]);

  /** 导航宽度变化时重新校准选中块，避免响应式切换后出现位置偏差。 */
  useLayoutEffect(() => {
    const navigationContainer = navigationContainerRef.current;
    if (!navigationContainer) return;

    let hasReceivedInitialObservation = false;
    let resizeFrame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!hasReceivedInitialObservation) {
        hasReceivedInitialObservation = true;
        return;
      }
      if (isIndicatorMovingRef.current) return;

      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        moveNavigationIndicator(activeSectionRef.current, false);
      });
    });
    resizeObserver.observe(navigationContainer);

    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      gsap.killTweensOf(navigationContainer);
    };
  }, [moveNavigationIndicator]);

  /** 响应模块按钮点击，先完成胶囊位移再更新内容，避免布局变化打断动画。 */
  function handleSectionClick(event: MouseEvent<HTMLButtonElement>): void {
    const targetSection = event.currentTarget.dataset.sectionKey as ProjectSectionKey;
    if (activeSectionRef.current === targetSection) return;

    activeSectionRef.current = targetSection;
    moveNavigationIndicator(targetSection, true, () => {
      if (activeSectionRef.current === targetSection) onSectionChange(targetSection);
    });
  }

  return (
    <nav className="mt-3 w-full max-w-full overflow-x-auto" aria-label="项目内部导航">
      <ul
        ref={navigationContainerRef}
        className="isolate relative flex w-max min-w-full items-center gap-1 rounded-full bg-white/30 p-1"
      >
        <li
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-[#292a27] will-change-transform"
          style={{
            opacity: 'var(--project-navigation-indicator-opacity, 0)',
            transform: 'translateX(var(--project-navigation-indicator-x, 0px))',
            width: 'var(--project-navigation-indicator-width, 0px)',
          }}
        />

        {projectSections.map((section) => {
          const Icon = section.icon;

          return (
            <li key={section.key}>
              <Button
                type="button"
                variant="ghost"
                data-section-key={section.key}
                aria-current={activeSection === section.key ? 'page' : undefined}
                onClick={handleSectionClick}
                className={`relative z-10 ${projectNavigationItemClass} text-[#31322f] hover:bg-transparent hover:text-[#31322f] active:translate-y-0`}
              >
                <Icon className="size-3.5" aria-hidden />
                {section.label}
              </Button>
            </li>
          );
        })}

        <li
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 text-white"
          style={{
            clipPath:
              'inset(4px calc(100% - var(--project-navigation-indicator-x, 0px) - var(--project-navigation-indicator-width, 0px)) 4px var(--project-navigation-indicator-x, 0px) round 9999px)',
          }}
        >
          <div className="flex size-full items-center gap-1 p-1">
            {projectSections.map((section) => {
              const Icon = section.icon;

              return (
                <span key={section.key} className={projectNavigationItemClass}>
                  <Icon className="size-3.5" aria-hidden />
                  {section.label}
                </span>
              );
            })}
          </div>
        </li>
      </ul>
    </nav>
  );
}
