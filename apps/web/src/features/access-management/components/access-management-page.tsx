/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户管理页面组件，展示用户、角色和权限码的基础管理视图
 * @Copyright: Copyright 1990 - 2026
 */
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { AccessManagementDashboardData } from "@/features/access-management/services/access-management-server.service"
import type {
  AccessPermission,
  AccessUser,
} from "@/features/access-management/types/access-management.type"
import { AccessManagementActions } from "./access-management-actions"

type AccessManagementPageProps = {
  data: AccessManagementDashboardData
}

type AccessManagementErrorPageProps = {
  message: string
}

const userStatusText: Record<AccessUser["status"], string> = {
  PENDING: "待验证",
  ACTIVE: "正常",
  DISABLED: "已禁用",
  LOCKED: "已锁定",
}

// 渲染用户、角色、权限码管理页面。
export function AccessManagementPage({ data }: AccessManagementPageProps) {
  return (
    <main className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-normal">用户管理</h1>
        <p className="text-sm text-muted-foreground">
          查看用户、角色和权限码的基础关系，后续可在这里补充绑定和授权操作。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="用户总数" value={data.users.length} />
        <SummaryCard title="角色总数" value={data.roles.length} />
        <SummaryCard title="权限码总数" value={data.permissions.length} />
      </div>

      <AccessManagementActions data={data} />

      <Card className="rounded-md shadow-none">
        <CardHeader>
          <CardTitle className="text-base">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>直接授权</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.length > 0 ? (
                data.users.map((user) => (
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
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-md shadow-none">
          <CardHeader>
            <CardTitle className="text-base">角色概览</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>角色</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead>用户数</TableHead>
                  <TableHead>权限数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.roles.length > 0 ? (
                  data.roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell>{role.desc || "暂无说明"}</TableCell>
                      <TableCell>{role.userCount}</TableCell>
                      <TableCell>{role.permissionCount}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRow colSpan={4} text="暂无角色数据" />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader>
            <CardTitle className="text-base">权限码概览</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>权限码</TableHead>
                  <TableHead>模块</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.permissions.length > 0 ? (
                  data.permissions.map((permission) => (
                    <PermissionRow
                      key={permission.id}
                      permission={permission}
                    />
                  ))
                ) : (
                  <EmptyRow colSpan={4} text="暂无权限码数据" />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

// 渲染用户管理数据加载失败状态。
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
