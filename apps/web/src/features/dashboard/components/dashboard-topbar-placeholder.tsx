/**
 * 本文件提供新版工作台顶部导航的本地选中态交互，暂时不执行路由跳转。
 */
'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@workspace/ui/components/button';

/** 当前原型可展示的平台导航标识。 */
type DashboardNavigationKey = 'dashboard' | 'matters' | 'decisions' | 'meetings' | 'replay' | 'members' | 'settings';

/** 主导航中可由移动选中块覆盖的菜单标识。 */
type MainNavigationKey = Exclude<DashboardNavigationKey, 'settings'>;

/** 选中背景块相对于导航容器的位置与宽度。 */
type NavigationIndicatorPosition = {
  /** 背景块左侧偏移量。 */
  left: number;
  /** 背景块宽度。 */
  width: number;
};

/** 工作台主导航的文字与稳定标识。 */
const navigationItems: ReadonlyArray<{ key: MainNavigationKey; label: string }> = [
  { key: 'dashboard', label: '工作台' },
  { key: 'matters', label: '议事空间' },
  { key: 'decisions', label: '决策中心' },
  { key: 'meetings', label: '会议中心' },
  { key: 'replay', label: '过程回放' },
  { key: 'members', label: '成员管理' },
];

/** 渲染可切换选中态、但不执行跳转的工作台顶部导航。 */
export function DashboardTopbarPlaceholder() {
  const [activeNavigation, setActiveNavigation] = useState<DashboardNavigationKey>('dashboard');
  const navigationContainerRef = useRef<HTMLElement | null>(null);
  const navigationItemRefs = useRef(new Map<MainNavigationKey, HTMLButtonElement>());
  const [indicatorPosition, setIndicatorPosition] = useState<NavigationIndicatorPosition>({ left: 0, width: 0 });

  /** 根据当前选中菜单测量同一个背景块的位置，让它在菜单间平滑移动。 */
  const updateNavigationIndicator = useCallback((): void => {
    if (activeNavigation === 'settings') {
      setIndicatorPosition({ left: 0, width: 0 });
      return;
    }

    const navigationContainer = navigationContainerRef.current;
    const activeItem = navigationItemRefs.current.get(activeNavigation);
    if (!navigationContainer || !activeItem) return;

    const navigationContainerBounds = navigationContainer.getBoundingClientRect();
    const activeItemBounds = activeItem.getBoundingClientRect();
    setIndicatorPosition({
      left: activeItemBounds.left - navigationContainerBounds.left,
      width: activeItemBounds.width,
    });
  }, [activeNavigation]);

  /** 在菜单切换或容器尺寸改变后重新定位选中背景块。 */
  useLayoutEffect(() => {
    const animationFrameId = window.requestAnimationFrame(updateNavigationIndicator);

    const navigationContainer = navigationContainerRef.current;
    if (!navigationContainer) {
      return () => window.cancelAnimationFrame(animationFrameId);
    }

    const resizeObserver = new ResizeObserver(updateNavigationIndicator);
    resizeObserver.observe(navigationContainer);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [updateNavigationIndicator]);

  /** 仅更新原型页面的菜单选中态，真实路由会在后续页面接入时补充。 */
  function handleNavigationSelect(key: DashboardNavigationKey): void {
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
            className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-[#292a27] transition-[left,width,opacity] duration-300 ease-out"
            style={{
              left: indicatorPosition.left,
              width: indicatorPosition.width,
              opacity: indicatorPosition.width ? 1 : 0,
            }}
          />
          {navigationItems.map((item) => {
            const isActive = activeNavigation === item.key;

            return (
              <Button
                key={item.key}
                type="button"
                variant="ghost"
                aria-current={isActive ? 'page' : undefined}
                className="relative z-10 inline-flex h-10 items-center justify-center rounded-full bg-transparent px-4 text-center text-sm leading-none font-medium text-white mix-blend-difference hover:bg-transparent hover:text-white"
                onClick={() => handleNavigationSelect(item.key)}
                ref={(element) => {
                  if (element) navigationItemRefs.current.set(item.key, element);
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </nav>

        <Button
          type="button"
          variant="ghost"
          aria-current={activeNavigation === 'settings' ? 'page' : undefined}
          className={`hidden h-12 rounded-full px-5 text-sm font-medium transition-colors sm:inline-flex ${
            activeNavigation === 'settings'
              ? 'bg-[#292a27] text-white hover:bg-[#292a27]'
              : 'bg-white/60 text-[#31322f] hover:bg-white/60'
          }`}
          onClick={() => handleNavigationSelect('settings')}
        >
          设置
        </Button>

        <div className="size-12 rounded-full bg-white/60" aria-label="通知入口占位" />
        <div className="size-12 rounded-full bg-white/60" aria-label="用户入口占位" />

        <Button
          type="button"
          variant="ghost"
          className="h-12 rounded-full bg-white/60 px-5 text-sm font-medium text-[#31322f] hover:bg-white/60 lg:hidden"
          onClick={() => handleNavigationSelect(activeNavigation)}
        >
          菜单
        </Button>
      </div>
    </header>
  );
}
