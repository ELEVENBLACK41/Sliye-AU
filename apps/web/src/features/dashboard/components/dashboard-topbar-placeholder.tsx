/**
 * 本文件提供新版工作台顶部导航，并根据当前路由展示选中态。
 */
'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@workspace/ui/components/button';
import { DashboardAccountMenuPlaceholder } from './dashboard-account-menu-placeholder';

/** 工作台主导航的文字与稳定标识。 */
const navigationItems = [
  { key: 'dashboard', label: '工作台', href: '/dashboardnew' },
  { key: 'matters', label: '议事空间', href: '/dashboardnew/matters' },
  { key: 'decisions', label: '决策中心', href: undefined },
  { key: 'meetings', label: '会议中心', href: undefined },
  { key: 'decision', label: '决策图谱', href: undefined },
  { key: 'members', label: '成员管理', href: undefined },
] as const;

/** 主导航中可由移动选中块覆盖的菜单标识。 */
type MainNavigationKey = (typeof navigationItems)[number]['key'];

/** 主导航按钮与颜色遮罩文字共用的尺寸样式，确保两层文字始终采用同一居中基准。 */
const navigationItemLayoutClass =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent px-4 text-center text-sm leading-none font-medium whitespace-nowrap';

/** 渲染随页面滚动保持固定、并支持真实路由跳转的工作台顶部导航。 */
export function DashboardTopbarPlaceholder() {
  const pathname = usePathname();
  const navigationContainerRef = useRef<HTMLElement | null>(null);
  const activeNavigation: MainNavigationKey = pathname.startsWith('/dashboardnew/matters')
    ? 'matters'
    : 'dashboard';
  const activeNavigationRef = useRef<MainNavigationKey>(activeNavigation);
  const hasPositionedIndicatorRef = useRef(false);

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

  /** 路由状态变化后校准选中块，兼容浏览器前进与后退导航。 */
  useLayoutEffect(() => {
    if (!hasPositionedIndicatorRef.current) {
      activeNavigationRef.current = activeNavigation;
      moveNavigationIndicator(activeNavigation, false);
      hasPositionedIndicatorRef.current = true;
      return;
    }

    if (activeNavigationRef.current === activeNavigation) return;

    activeNavigationRef.current = activeNavigation;
    moveNavigationIndicator(activeNavigation, true);
  }, [activeNavigation, moveNavigationIndicator]);

  /** 仅在导航容器真实调整尺寸时重新定位，跳过观察器首次回调以免覆盖切换动画。 */
  useLayoutEffect(() => {
    const navigationContainer = navigationContainerRef.current;
    if (!navigationContainer) return;

    let hasReceivedInitialObservation = false;

    const resizeObserver = new ResizeObserver(() => {
      if (!hasReceivedInitialObservation) {
        hasReceivedInitialObservation = true;
        return;
      }

      moveNavigationIndicator(activeNavigationRef.current, false);
    });
    resizeObserver.observe(navigationContainer);
    return () => {
      resizeObserver.disconnect();
      gsap.killTweensOf(navigationContainer);
    };
  }, [moveNavigationIndicator]);

  /** 用户点击可用路由时立即播放选中动画，不等待目标页面加载完成。 */
  function handleNavigationIntent(targetNavigation: MainNavigationKey): void {
    if (activeNavigationRef.current === targetNavigation) return;

    activeNavigationRef.current = targetNavigation;
    moveNavigationIndicator(targetNavigation, true);
  }

  return (
    <header className="sticky top-4 z-50 flex items-center gap-4 sm:top-6" aria-label="工作台顶部导航">
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
          {navigationItems.map((item) => {
            const navigationButton = (
              <Button
                type="button"
                variant="ghost"
                aria-current={activeNavigation === item.key ? 'page' : undefined}
                data-navigation-key={item.key}
                className={`relative z-10 ${navigationItemLayoutClass} text-[#31322f] hover:bg-transparent hover:text-[#31322f] active:translate-y-0`}
              >
                {item.label}
              </Button>
            );

            return item.href ? (
              <Button key={item.key} asChild variant="ghost" className="h-auto rounded-full p-0">
                <Link
                  href={item.href}
                  aria-current={activeNavigation === item.key ? 'page' : undefined}
                  data-navigation-key={item.key}
                  className={`relative z-10 ${navigationItemLayoutClass} text-[#31322f] hover:bg-transparent hover:text-[#31322f]`}
                  onClick={() => handleNavigationIntent(item.key)}
                >
                  {item.label}
                </Link>
              </Button>
            ) : (
              <span key={item.key}>{navigationButton}</span>
            );
          })}
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
