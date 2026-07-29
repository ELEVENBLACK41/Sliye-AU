/**
 * 本文件提供新版工作台顶部导航的本地选中态交互，暂时不执行路由跳转。
 */
'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Bell } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { DashboardAccountMenuPlaceholder } from './dashboard-account-menu-placeholder';

/** 工作台主导航的文字与稳定标识。 */
const navigationItems = [
  { key: 'dashboard', label: '工作台' },
  { key: 'matters', label: '议事空间' },
  { key: 'decisions', label: '决策中心' },
  { key: 'meetings', label: '会议中心' },
  { key: 'decision', label: '决策图谱' },
  { key: 'members', label: '成员管理' },
] as const;

/** 主导航中可由移动选中块覆盖的菜单标识。 */
type MainNavigationKey = (typeof navigationItems)[number]['key'];

/** 主导航按钮与颜色遮罩文字共用的尺寸样式，确保两层文字始终采用同一居中基准。 */
const navigationItemLayoutClass =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent px-4 text-center text-sm leading-none font-medium whitespace-nowrap';

/** 渲染可切换选中态、但不执行跳转的工作台顶部导航。 */
export function DashboardTopbarPlaceholder() {
  const [activeNavigation, setActiveNavigation] = useState<MainNavigationKey>('dashboard');
  const activeNavigationRef = useRef<MainNavigationKey>('dashboard');
  const navigationContainerRef = useRef<HTMLElement | null>(null);

  /** 测量目标菜单，并把现有黑色选中块直接移动或平滑重定向到该位置。 */
  const moveNavigationIndicator = useCallback(
    (targetNavigation: MainNavigationKey, shouldAnimate: boolean): void => {
      const navigationContainer = navigationContainerRef.current;
      if (!navigationContainer) return;

      const targetItem = navigationContainer.querySelector<HTMLElement>(
        `[data-navigation-key="${targetNavigation}"]`,
      );

      gsap.to(navigationContainer, {
        ...(targetItem && {
          '--navigation-indicator-x': `${targetItem.offsetLeft}px`,
        }),
        '--navigation-indicator-width': targetItem ? `${targetItem.offsetWidth}px` : '0px',
        '--navigation-indicator-opacity': targetItem ? 1 : 0,
        duration: shouldAnimate ? 0.32 : 0,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    },
    [],
  );

  /** 首次渲染时定位选中块，并在导航尺寸变化后无动画地重新对齐。 */
  useLayoutEffect(() => {
    const navigationContainer = navigationContainerRef.current;
    if (!navigationContainer) return;

    moveNavigationIndicator(activeNavigationRef.current, false);

    const resizeObserver = new ResizeObserver(() => {
      moveNavigationIndicator(activeNavigationRef.current, false);
    });
    resizeObserver.observe(navigationContainer);
    return () => {
      resizeObserver.disconnect();
      gsap.killTweensOf(navigationContainer);
    };
  }, [moveNavigationIndicator]);

  /** 仅更新原型页面的菜单选中态，真实路由会在后续页面接入时补充。 */
  function handleNavigationSelect(key: MainNavigationKey): void {
    activeNavigationRef.current = key;
    moveNavigationIndicator(key, true);
    setActiveNavigation(key);
  }

  return (
    <header className="flex items-center gap-4" aria-label="工作台顶部导航">
      <div
        className="flex h-12 shrink-0 items-center rounded-full border border-black/25 bg-white/30 px-6 text-2xl font-medium tracking-tight"
        aria-label="Decision Hub 品牌标识"
      >
        Decision Hub
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2" aria-label="顶部导航与操作区域">
        <nav
          ref={navigationContainerRef}
          aria-label="主导航"
          className="isolate relative hidden h-12 items-center gap-1 rounded-full bg-white/55 p-1 lg:flex"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-[#292a27] will-change-transform"
            style={{
              opacity: 'var(--navigation-indicator-opacity, 0)',
              transform: 'translateX(var(--navigation-indicator-x, 0px))',
              width: 'var(--navigation-indicator-width, 0px)',
            }}
          />
          {navigationItems.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              aria-current={activeNavigation === item.key ? 'page' : undefined}
              data-navigation-key={item.key}
              className={`relative z-10 ${navigationItemLayoutClass} text-[#31322f] hover:bg-transparent hover:text-[#31322f] active:translate-y-0`}
              onClick={() => handleNavigationSelect(item.key)}
            >
              {item.label}
            </Button>
          ))}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 flex items-center gap-1 p-1 text-white"
            style={{
              clipPath:
                'inset(4px calc(100% - var(--navigation-indicator-x, 0px) - var(--navigation-indicator-width, 0px)) 4px var(--navigation-indicator-x, 0px) round 9999px)',
            }}
          >
            {navigationItems.map((item) => (
              <span key={item.key} className={navigationItemLayoutClass}>
                {item.label}
              </span>
            ))}
          </div>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 rounded-full bg-white/60 text-[#31322f] hover:bg-white/80"
          aria-label="查看通知"
        >
          <Bell className="size-5" aria-hidden />
        </Button>

        <DashboardAccountMenuPlaceholder />

        <Button
          type="button"
          variant="ghost"
          className="h-12 rounded-full bg-white/60 px-5 text-sm font-medium text-[#31322f] hover:bg-white/60 lg:hidden"
        >
          菜单
        </Button>
      </div>
    </header>
  );
}
