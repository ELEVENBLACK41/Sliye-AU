/**
 * 本文件按业务模块展示只读权限码目录和允许的数据范围。
 */
import type { AccessDataScope, AccessPermission } from '@workspace/contracts/access';

import { Badge } from '@workspace/ui/components/badge';

/** 权限目录属性。 */
type PermissionDirectoryProps = {
  /** 系统、历史和自定义权限目录。 */
  permissions: AccessPermission[];
};

/** 数据范围中文名称。 */
const scopeLabels: Record<AccessDataScope, string> = {
  ALL: '全部数据', OWN: '本人数据', DEPT: '本部门', DEPT_AND_CHILD: '本部门及下级', PARTICIPATED: '参与的数据', CUSTOM: '历史自定义范围',
};

/** 按模块分组渲染只读权限目录。 */
export function PermissionDirectory({ permissions }: PermissionDirectoryProps) {
  const groups = Map.groupBy(permissions, (permission) => permission.module);
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-organization-surface shadow-sm" aria-labelledby="permission-directory-title">
      <div className="border-b p-5 sm:p-6"><p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground">PERMISSION CODES</p><h2 id="permission-directory-title" className="mt-1 text-xl font-semibold tracking-tight">权限码目录</h2><p className="mt-2 text-sm text-muted-foreground">系统权限只读，代码是接口、守卫与审计使用的稳定标识。</p></div>
      {permissions.length ? <div className="grid gap-5 p-5 sm:p-6">{[...groups.entries()].map(([module, items]) => <section key={module} className="grid gap-2" aria-labelledby={`permission-module-${module}`}><div className="flex items-center gap-2"><h3 id={`permission-module-${module}`} className="font-mono text-xs font-semibold">{module}</h3><Badge variant="secondary">{items.length}</Badge></div><div className="grid gap-2 lg:grid-cols-2">{items.map((permission) => <article key={permission.id} className="rounded-2xl border bg-background/45 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-xs">{permission.code}</p><h4 className="mt-1 font-semibold">{permission.name ?? '未命名权限'}</h4></div><Badge variant="outline">{permission.kind}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{permission.desc || '暂无权限说明'}</p><div className="mt-3 flex flex-wrap gap-1">{permission.allowedScopes.length ? permission.allowedScopes.map((scope) => <Badge key={scope} variant="secondary">{scopeLabels[scope]}</Badge>) : <span className="text-xs text-muted-foreground">历史权限未声明可授予范围</span>}</div></article>)}</div></section>)}</div> : <p className="p-10 text-center text-sm text-muted-foreground">当前没有权限目录记录</p>}
    </section>
  );
}
