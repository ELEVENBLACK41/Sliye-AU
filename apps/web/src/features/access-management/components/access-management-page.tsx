/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户管理页面组件，使用 Suspense 分区流式渲染用户、角色和权限数据
 * @Copyright: Copyright 1990 - 2026
 */
import { Suspense, type ReactNode } from "react"
import { ShieldCheck } from "lucide-react"
import { ACCESS_MANAGEMENT_PERMISSIONS } from "@workspace/contracts/access"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  getAccessManagementDashboardData,
  getAccessPermissions,
  getAccessRoles,
  getAccessUsers,
} from "@/features/access-management/services/access-management-server.service"
import type {
  AccessPermission,
  AccessUser,
} from "@/features/access-management/types/access-management.type"
import { AccessManagementActions } from "./access-management-actions"

type AccessManagementPageProps = {
  currentUserPermissions: string[]
}

type AccessManagementErrorPageProps = {
  message: string
}

type SectionResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      message: string
    }

const userStatusText: Record<AccessUser["status"], string> = {
  PENDING: "待验证",
  ACTIVE: "正常",
  DISABLED: "已禁用",
  LOCKED: "已锁定",
}

// 渲染用户、角色、权限码管理页面骨架，数据区块由 Suspense 独立流式填充。
export function AccessManagementPage({
  currentUserPermissions,
}: AccessManagementPageProps) {
  const canWrite = currentUserPermissions.includes(
    ACCESS_MANAGEMENT_PERMISSIONS.write,
  )

  return (
    <main className="flex flex-col gap-4">
      <section className="flex flex-col justify-between gap-3 rounded-md border bg-background p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-semibold tracking-normal">用户管理</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            维护用户、角色、权限码和直接授权关系；前端只做展示控制，后端接口负责真实拦截。
          </p>
        </div>
        <Badge variant={canWrite ? "default" : "secondary"}>
          {canWrite ? "可管理授权" : "只读视图"}
        </Badge>
      </section>

      <Suspense fallback={<SummaryCardsFallback />}>
        <SummaryCardsSection />
      </Suspense>

      {canWrite ? (
        <Suspense fallback={<AccessManagementActionsFallback />}>
          <AccessManagementActionsSection />
        </Suspense>
      ) : (
        <ReadOnlyAlert />
      )}

      <Suspense fallback={<UsersTableFallback />}>
        <UsersTableSection />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<RolesTableFallback />}>
          <RolesTableSection />
        </Suspense>
        <Suspense fallback={<PermissionsTableFallback />}>
          <PermissionsTableSection />
        </Suspense>
      </div>
    </main>
  )
}

// 渲染用户管理数据加载失败的页面级兜底。
export function AccessManagementErrorPage({
  message,
}: AccessManagementErrorPageProps) {
  return (
    <main className="rounded-md border bg-background p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-normal">用户管理</h1>
        <p className="text-sm text-destructive">{message}</p>
      </div>
    </main>
  )
}

// 渲染汇总统计卡片区。
async function SummaryCardsSection() {
  const result = await resolveSection(
    getAccessManagementDashboardData,
    "用户管理统计加载失败",
  )

  if (!result.ok) {
    return <SectionError message={result.message} />
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard title="用户总数" value={result.data.users.length} />
      <SummaryCard title="角色总数" value={result.data.roles.length} />
      <SummaryCard title="权限码总数" value={result.data.permissions.length} />
    </div>
  )
}

// 渲染权限分配操作区，等待三类数据齐备后挂载客户端表单。
async function AccessManagementActionsSection() {
  const result = await resolveSection(
    getAccessManagementDashboardData,
    "权限分配数据加载失败",
  )

  if (!result.ok) {
    return <SectionError message={result.message} />
  }

  return <AccessManagementActions data={result.data} />
}

// 渲染用户列表区。
async function UsersTableSection() {
  const result = await resolveSection(getAccessUsers, "用户列表加载失败")

  if (!result.ok) {
    return <TableErrorCard title="用户列表" message={result.message} />
  }

  return (
    <UserTableCard>
      <TableBody>
        {result.data.length > 0 ? (
          result.data.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {user.name || "未设置姓名"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{userStatusText[user.status]}</Badge>
              </TableCell>
              <TableCell>{user.departmentName || "未分配"}</TableCell>
              <TableCell>
                <BadgeList
                  items={user.roles.map((role) => role.name)}
                  emptyText="暂无角色"
                />
              </TableCell>
              <TableCell>
                <BadgeList
                  items={user.directPermissions.map(
                    (permission) =>
                      `${permission.effect}:${permission.permission.code}`,
                  )}
                  emptyText="暂无直接授权"
                />
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} text="暂无用户数据" />
        )}
      </TableBody>
    </UserTableCard>
  )
}

// 渲染角色概览区。
async function RolesTableSection() {
  const result = await resolveSection(getAccessRoles, "角色列表加载失败")

  if (!result.ok) {
    return <TableErrorCard title="角色概览" message={result.message} />
  }

  return (
    <RoleTableCard>
      <TableBody>
        {result.data.length > 0 ? (
          result.data.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              <TableCell>{role.desc || "暂无说明"}</TableCell>
              <TableCell>{role.userCount}</TableCell>
              <TableCell>
                <BadgeList
                  items={role.permissions.map((permission) => permission.code)}
                  emptyText="暂无权限"
                />
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={4} text="暂无角色数据" />
        )}
      </TableBody>
    </RoleTableCard>
  )
}

// 渲染权限码概览区。
async function PermissionsTableSection() {
  const result = await resolveSection(getAccessPermissions, "权限码加载失败")

  if (!result.ok) {
    return <TableErrorCard title="权限码概览" message={result.message} />
  }

  return (
    <PermissionTableCard>
      <TableBody>
        {result.data.length > 0 ? (
          result.data.map((permission) => (
            <PermissionRow key={permission.id} permission={permission} />
          ))
        ) : (
          <EmptyRow colSpan={4} text="暂无权限码数据" />
        )}
      </TableBody>
    </PermissionTableCard>
  )
}

// 渲染只读权限提示。
function ReadOnlyAlert() {
  return (
    <Alert className="rounded-md">
      <ShieldCheck aria-hidden />
      <AlertTitle>当前账号没有写入权限</AlertTitle>
      <AlertDescription>
        你可以查看用户、角色和权限结构，但不能分配角色或变更权限。
      </AlertDescription>
    </Alert>
  )
}

// 渲染统计卡片。
function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="gap-1">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        <p className="text-2xl font-semibold">{value}</p>
      </CardHeader>
    </Card>
  )
}

// 渲染用户表格卡片外壳。
function UserTableCard({ children }: { children: ReactNode }) {
  return (
    <TableCard title="用户列表" headers={["用户", "状态", "部门", "角色", "直接授权"]}>
      {children}
    </TableCard>
  )
}

// 渲染角色表格卡片外壳。
function RoleTableCard({ children }: { children: ReactNode }) {
  return (
    <TableCard title="角色概览" headers={["角色", "说明", "用户数", "拥有权限"]}>
      {children}
    </TableCard>
  )
}

// 渲染权限码表格卡片外壳。
function PermissionTableCard({ children }: { children: ReactNode }) {
  return (
    <TableCard title="权限码概览" headers={["权限码", "模块", "动作", "说明"]}>
      {children}
    </TableCard>
  )
}

// 渲染通用表格卡片结构。
function TableCard({
  title,
  headers,
  children,
}: {
  title: string
  headers: string[]
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {children}
        </Table>
      </CardContent>
    </Card>
  )
}

// 渲染权限码表格行。
function PermissionRow({ permission }: { permission: AccessPermission }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{permission.code}</TableCell>
      <TableCell>{permission.module}</TableCell>
      <TableCell>{permission.action}</TableCell>
      <TableCell>{permission.desc || permission.name || "暂无说明"}</TableCell>
    </TableRow>
  )
}

// 渲染一组徽标。
function BadgeList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>
  }

  return (
    <div className="flex max-w-80 flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  )
}

// 渲染空表格行。
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-24 text-center text-muted-foreground"
      >
        {text}
      </TableCell>
    </TableRow>
  )
}

// 渲染统计卡片加载态。
function SummaryCardsFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {["用户总数", "角色总数", "权限码总数"].map((title) => (
        <Card key={title} className="rounded-md shadow-none">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

// 渲染操作区加载态。
function AccessManagementActionsFallback() {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-20" />
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="flex min-w-0 flex-col gap-3 rounded-md border bg-muted/20 p-4"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// 渲染用户表格加载态。
function UsersTableFallback() {
  return (
    <TableFallback
      title="用户列表"
      headers={["用户", "状态", "部门", "角色", "直接授权"]}
      columnCount={5}
    />
  )
}

// 渲染角色表格加载态。
function RolesTableFallback() {
  return (
    <TableFallback
      title="角色概览"
      headers={["角色", "说明", "用户数", "拥有权限"]}
      columnCount={4}
    />
  )
}

// 渲染权限码表格加载态。
function PermissionsTableFallback() {
  return (
    <TableFallback
      title="权限码概览"
      headers={["权限码", "模块", "动作", "说明"]}
      columnCount={4}
    />
  )
}

// 渲染通用表格加载态。
function TableFallback({
  title,
  headers,
  columnCount,
}: {
  title: string
  headers: string[]
  columnCount: number
}) {
  return (
    <TableCard title={title} headers={headers}>
      <TableBody>
        {[0, 1, 2].map((row) => (
          <TableRow key={row}>
            {Array.from({ length: columnCount }, (_, column) => (
              <TableCell key={column}>
                <Skeleton className="h-5 w-full max-w-40" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  )
}

// 渲染普通区块错误提示。
function SectionError({ message }: { message: string }) {
  return (
    <Alert className="rounded-md" variant="destructive">
      <AlertTitle>数据加载失败</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

// 渲染表格区块错误提示。
function TableErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  )
}

// 捕获区块级数据读取错误，避免单个接口失败拖垮整页。
async function resolveSection<T>(
  loader: () => Promise<T>,
  fallbackMessage: string,
): Promise<SectionResult<T>> {
  try {
    const data = await loader()

    return {
      ok: true,
      data,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : fallbackMessage,
    }
  }
}
