/**
 * 本文件提供新版工作台顶部导航的静态占位结构，不包含菜单图标、跳转或用户操作。
 */

/** 顶部导航中单个菜单项的视觉占位属性。 */
type NavigationItemPlaceholderProps = {
  /** 是否表达当前菜单选中状态。 */
  active?: boolean;
  /** 菜单占位宽度。 */
  width?: 'narrow' | 'normal';
};

/** 渲染一个无文字、无跳转的顶部菜单项占位。 */
function NavigationItemPlaceholder({ active = false, width = 'normal' }: NavigationItemPlaceholderProps) {
  return (
    <span
      aria-hidden
      className={`${width === 'narrow' ? 'w-10' : 'w-14'} h-8 rounded-full ${active ? 'bg-[#292a27]' : 'bg-black/[0.055]'}`}
    />
  );
}

/** 渲染桌面横向导航与移动端压缩导航占位。 */
export function DashboardTopbarPlaceholder() {
  return (
    <header className="flex items-center justify-between gap-4" aria-label="工作台顶部导航占位">
      <div className="h-10 w-24 shrink-0 rounded-full border border-black/25 bg-white/30" aria-label="品牌区域占位" />

      <nav
        aria-label="主导航占位"
        className="hidden items-center gap-1 rounded-full bg-white/55 p-1 shadow-sm shadow-black/5 lg:flex"
      >
        <NavigationItemPlaceholder active />
        <NavigationItemPlaceholder />
        <NavigationItemPlaceholder />
        <NavigationItemPlaceholder />
        <NavigationItemPlaceholder />
        <NavigationItemPlaceholder />
        <NavigationItemPlaceholder />
      </nav>

      <div className="flex shrink-0 items-center gap-2" aria-label="顶部操作区域占位">
        <div className="hidden h-10 w-24 rounded-full bg-white/60 sm:block" />
        <div className="size-10 rounded-full bg-white/60" />
        <div className="size-10 rounded-full bg-white/60" />
        <div className="h-10 w-16 rounded-full bg-white/60 lg:hidden" aria-label="移动端菜单占位" />
      </div>
    </header>
  );
}
