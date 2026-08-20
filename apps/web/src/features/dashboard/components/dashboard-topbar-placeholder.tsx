/**
 * 本文件提供新版工作台顶部导航，并根据当前路由展示选中态。
 */
'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Bell, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@workspace/contracts/auth';

import { Button } from '@workspace/ui/components/button';
import { Separator } from '@workspace/ui/components/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { DashboardAccountMenuPlaceholder } from './dashboard-account-menu-placeholder';

/** 工作台主导航的文字与稳定标识。 */
const navigationItems = [
  { key: 'dashboard', label: '工作台', href: '/dashboard' },
  { key: 'projects', label: '项目空间', href: '/projects' },
  { key: 'decisions', label: '决策中心', href: '/decisions' },
  { key: 'ai', label: 'AI 实验室', href: '/ai' },
  { key: 'meetings', label: '会议中心', href: '/meetings' },
  { key: 'graph', label: '关系图谱', href: '/graph' },
  { key: 'members', label: '组织与权限', href: '/members' },
] as const;

/** 主导航中可由移动选中块覆盖的菜单标识。 */
type MainNavigationKey = (typeof navigationItems)[number]['key'];

/** 主导航按钮与颜色遮罩文字共用的尺寸样式，确保两层文字始终采用同一居中基准。 */
const navigationItemLayoutClass =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent px-4 text-center text-sm leading-none font-medium whitespace-nowrap';

/** 新版顶部导航属性。 */
type DashboardTopbarPlaceholderProps = {
  /** 当前账号是否允许进入组织与权限一级空间。 */
  canAccessOrganization: boolean;
  /** 当前登录用户的真实认证资料。 */
  currentUser: Pick<AuthUser, 'name' | 'email' | 'avatarUrl'>;
};

/** 渲染新版顶部导航。 */
export function DashboardTopbarPlaceholder({ canAccessOrganization, currentUser }: DashboardTopbarPlaceholderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleNavigationItems = navigationItems.filter((item) => item.key !== 'members' || canAccessOrganization);
  const navigationContainerRef = useRef<HTMLElement | null>(null);
  const activeNavigation: MainNavigationKey = pathname.startsWith('/members')
    ? 'members'
    : pathname.startsWith('/graph')
      ? 'graph'
      : pathname.startsWith('/meetings')
        ? 'meetings'
        : pathname.startsWith('/decisions')
          ? 'decisions'
          : pathname.startsWith('/ai')
            ? 'ai'
            : pathname.startsWith('/projects')
              ? 'projects'
              : 'dashboard';
  const activeNavigationRef = useRef<MainNavigationKey>(activeNavigation);
  const hasPositionedIndicatorRef = useRef(false);

  /** 测量目标菜单，并把现有黑色选中块直接移动或平滑重定向到该位置。 */
  const moveNavigationIndicator = useCallback(
    (targetNavigation: MainNavigationKey, shouldAnimate: boolean, onComplete?: () => void): void => {
      const navigationContainer = navigationContainerRef.current;
      if (!navigationContainer) return;

      const targetItem = navigationContainer.querySelector<HTMLElement>(`[data-navigation-key="${targetNavigation}"]`);

      gsap.to(navigationContainer, {
        ...(targetItem && {
          '--navigation-indicator-x': `${targetItem.offsetLeft}px`,
        }),
        '--navigation-indicator-width': targetItem ? `${targetItem.offsetWidth}px` : '0px',
        '--navigation-indicator-opacity': targetItem ? 1 : 0,
        duration: shouldAnimate ? 0.32 : 0,
        ease: 'power3.out',
        overwrite: 'auto',
        onComplete,
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

  /** 先完成选中块动画，再提交可能包含大量客户端组件的目标路由渲染。 */
  function handleNavigationIntent(targetNavigation: MainNavigationKey, targetHref: string): void {
    if (activeNavigationRef.current === targetNavigation) return;

    activeNavigationRef.current = targetNavigation;
    moveNavigationIndicator(targetNavigation, true, () => {
      if (activeNavigationRef.current !== targetNavigation || pathname === targetHref) return;

      router.push(targetHref);
    });
  }

  return (
    <header className="relative z-50 flex items-center gap-4 lg:sticky lg:top-0" aria-label="工作台顶部导航">
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
          className="isolate relative hidden h-12 items-center gap-1 rounded-full border border-white/65 bg-white/20 p-1 shadow-[0_10px_30px_rgba(41,42,39,0.08)] backdrop-blur-sm backdrop-saturate-150 lg:flex"
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
          {visibleNavigationItems.map((item) => (
            <Button key={item.key} asChild variant="ghost" className="h-auto rounded-full p-0">
              <Link
                href={item.href}
                aria-current={activeNavigation === item.key ? 'page' : undefined}
                data-navigation-key={item.key}
                className={`relative z-10 ${navigationItemLayoutClass} text-[#31322f] hover:bg-transparent hover:text-[#31322f]`}
                onNavigate={(event) => {
                  event.preventDefault();
                  handleNavigationIntent(item.key, item.href);
                }}
              >
                {item.label}
              </Link>
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
            {visibleNavigationItems.map((item) => (
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
          className="hidden size-12 rounded-full border border-white/65 bg-white/20 text-[#31322f] shadow-[0_10px_30px_rgba(41,42,39,0.08)] backdrop-blur-sm backdrop-saturate-150 hover:bg-white/30 sm:inline-flex"
          aria-label="查看通知"
        >
          <Bell className="size-5" aria-hidden />
        </Button>

        <DashboardAccountMenuPlaceholder user={currentUser} />

        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              className="h-12 rounded-full px-5 text-sm font-medium lg:hidden"
              aria-label="打开主导航菜单"
            >
              <Menu className="size-4" aria-hidden />
              菜单
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(22rem,88vw)] bg-background sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>主导航</SheetTitle>
              <SheetDescription>前往 Decision Hub 的一级业务空间。</SheetDescription>
            </SheetHeader>
            <Separator />
            <nav className="flex flex-col gap-2 px-4" aria-label="移动端主导航">
              {visibleNavigationItems.map((item) => (
                <SheetClose key={item.key} asChild>
                  <Button
                    asChild
                    variant={activeNavigation === item.key ? 'secondary' : 'ghost'}
                    className="h-11 w-full justify-start rounded-xl px-4"
                  >
                    <Link href={item.href} aria-current={activeNavigation === item.key ? 'page' : undefined}>
                      {item.label}
                    </Link>
                  </Button>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
