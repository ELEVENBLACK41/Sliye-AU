/**
 * 本文件展示新版工作台页头的静态布局，包括欢迎区、搜索框与主操作占位。
 */

/** 渲染工作台顶部信息与操作区域，不包含真实用户信息和交互。 */
export function DashboardHeaderPlaceholder() {
  return (
    <header className="flex flex-col gap-4 pt-1 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2" aria-label="欢迎信息占位">
        <div className="h-6 w-40 rounded-md bg-white/15" />
        <div className="h-3 w-52 rounded-full bg-white/8" />
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
        <div
          aria-label="搜索框占位"
          className="h-11 min-w-0 rounded-full border border-white/6 bg-[#30322f] sm:w-64"
        />
        <div aria-label="主操作按钮占位" className="h-11 rounded-full bg-[#536ff3] sm:w-32" />
      </div>
    </header>
  );
}
