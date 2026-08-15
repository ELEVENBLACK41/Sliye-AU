/*
 * @Description: 这个文件负责渲染 admin 用户管理示例页面。
 */
import { Eye, Plus, Search, ShieldCheck, UserRound, UserX } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';

import { adminUsers } from '../data/admin-users';
import type { AdminUserListItem, AdminUserStatus } from '../types/admin-user';

type UserPageState = 'loading' | 'empty' | 'error' | 'success';

const currentState: UserPageState = 'success';

const statusClassNames: Record<AdminUserStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DISABLED: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  LOCKED: 'border-red-200 bg-red-50 text-red-700',
};

const statusText: Record<AdminUserStatus, string> = {
  PENDING: '待验证',
  ACTIVE: '正常',
  DISABLED: '已禁用',
  LOCKED: '已锁定',
};

/** 格式化日期字段，空值显示为短横线。 */
function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

/** 获取用户名称首字母作为头像占位。 */
function getUserInitial(user: AdminUserListItem) {
  const source = user.name ?? user.email;

  return source.slice(0, 1).toUpperCase();
}

/** 渲染用户状态 badge。 */
function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  return (
    <Badge variant="outline" className={statusClassNames[status]}>
      {statusText[status]}
    </Badge>
  );
}

/** 渲染用户页面顶部的指标卡片。 */
function UserStats() {
  const activeCount = adminUsers.filter((user) => user.status === 'ACTIVE').length;
  const pendingCount = adminUsers.filter((user) => user.status === 'PENDING').length;
  const lockedCount = adminUsers.filter((user) => user.status === 'LOCKED').length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="rounded-md shadow-none">
        <CardHeader className="pb-2">
          <CardDescription>用户总数</CardDescription>
          <CardTitle className="text-2xl">{adminUsers.length}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="rounded-md shadow-none">
        <CardHeader className="pb-2">
          <CardDescription>活跃账号</CardDescription>
          <CardTitle className="text-2xl">{activeCount}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="rounded-md shadow-none">
        <CardHeader className="pb-2">
          <CardDescription>待验证 / 已锁定</CardDescription>
          <CardTitle className="text-2xl">
            {pendingCount} / {lockedCount}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

/** 渲染用户表格行。 */
function UserTableRow({ user }: { user: AdminUserListItem }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 rounded-md">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? user.email} />
            <AvatarFallback className="rounded-md">{getUserInitial(user)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name ?? '未命名用户'}</p>
            <p className="truncate text-xs text-muted-foreground">ID: {user.id}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <UserStatusBadge status={user.status} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {role}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.department ?? '-'}</TableCell>
      <TableCell className="text-muted-foreground">{user.emailVerifiedAt ? '已验证' : '未验证'}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(user.lastLoginAt)}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm">
            <Eye className="size-4" />
            <span className="sr-only">查看资料</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <ShieldCheck className="size-4" />
            <span className="sr-only">编辑角色</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <UserX className="size-4" />
            <span className="sr-only">禁用账号</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** 渲染用户表格。 */
function UsersTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>用户</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>角色</TableHead>
          <TableHead>部门</TableHead>
          <TableHead>邮箱验证</TableHead>
          <TableHead>最近登录</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {adminUsers.map((user) => (
          <UserTableRow key={user.id} user={user} />
        ))}
      </TableBody>
    </Table>
  );
}

/** 渲染用户页不同数据状态。 */
function UserStateContent({ state }: { state: UserPageState }) {
  if (state === 'loading') {
    return (
      <div className="space-y-3" aria-label="正在加载用户">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed text-center">
        <UserRound className="size-10 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-medium">暂无用户</p>
        <p className="mt-1 text-sm text-muted-foreground">创建第一个平台账号后即可开始管理访问权限。</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-center">
        <p className="font-medium text-destructive">用户数据加载失败</p>
        <p className="mt-1 text-sm text-muted-foreground">这是为后续 API 接入预留的错误状态。</p>
      </div>
    );
  }

  return <UsersTable />;
}

/** 渲染用户管理页面的完整静态 UI。 */
function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">平台访问</p>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal">用户管理</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            集中管理平台账号、角色分配、账号状态和登录可见性。
          </p>
        </div>
        <Button className="w-full md:w-auto">
          <Plus className="size-4" aria-hidden />
          创建用户
        </Button>
      </div>

      <UserStats />

      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>平台用户</CardTitle>
            <CardDescription>当前为静态预览数据，后续可替换为用户 API。</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative md:max-w-sm md:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜索用户..." />
            </div>
            <Button variant="outline" className="justify-start md:w-36">
              状态：全部
            </Button>
            <Button variant="outline" className="justify-start md:w-36">
              角色：全部
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <UserStateContent state={currentState} />
        </CardContent>
      </Card>
    </div>
  );
}

export { UsersPage };
