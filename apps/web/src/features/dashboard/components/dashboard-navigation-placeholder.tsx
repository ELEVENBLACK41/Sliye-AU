/**
 * 本文件展示新版工作台左侧导航栏的静态占位结构，不包含图标、路由或用户菜单交互。
 */

/** 导航栏中用于表达未来图标位置的统一占位块。 */
function NavigationIconPlaceholder({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        active
          ? 'size-10 rounded-full border border-[#cfff54]/70 bg-[#cfff54] shadow-[0_0_22px_rgba(207,255,84,0.2)]'
          : 'size-10 rounded-full border border-white/8 bg-white/6'
      }
    />
  );
}

/** 渲染桌面端窄导航和移动端顶部占位导航。 */
export function DashboardNavigationPlaceholder() {
  return (
    <>
      <aside
        aria-label="工作台主导航占位"
        className="sticky top-7 hidden h-[calc(100dvh-3.5rem)] flex-col items-center px-3 py-1 lg:flex"
      >
        <div className="mb-8 size-8 rounded-lg border border-white/15 bg-white/10" aria-label="品牌标识占位" />

        <nav aria-label="主菜单占位" className="flex flex-1 flex-col items-center gap-3">
          <NavigationIconPlaceholder active />
          <NavigationIconPlaceholder />
          <NavigationIconPlaceholder />
          <NavigationIconPlaceholder />
          <NavigationIconPlaceholder />
        </nav>

        <div className="mt-8 flex flex-col items-center gap-4">
          <NavigationIconPlaceholder />
          <div className="size-10 rounded-full border border-dashed border-white/20 bg-white/8" aria-label="用户头像占位" />
        </div>
      </aside>

      <div className="flex items-center justify-between rounded-2xl border border-white/6 bg-[#252724] p-3 lg:hidden">
        <div className="size-8 rounded-lg border border-white/15 bg-white/10" aria-label="品牌标识占位" />
        <div className="h-9 w-24 rounded-full border border-white/8 bg-white/6" aria-label="移动端菜单占位" />
      </div>
    </>
  );
}
