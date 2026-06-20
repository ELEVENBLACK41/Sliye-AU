/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户管理操作区，提供角色分配、权限分配和用户直接授权能力
 * @Copyright: Copyright 1990 - 2026
 */
"use client"

import type { ReactNode } from "react"
import { FormEvent, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import type { AccessManagementDashboardData } from "@/features/access-management/services/access-management-server.service"
import type {
  AccessUserPermission,
} from "@/features/access-management/types/access-management.type"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"

type AccessManagementActionsProps = {
  data: AccessManagementDashboardData
}

type ActionState = {
  message: string
  type: "success" | "error"
} | null

const effectOptions = [
  { value: "ALLOW", label: "允许" },
  { value: "DENY", label: "拒绝" },
]

const scopeOptions = [
  { value: "ALL", label: "全部数据" },
  { value: "OWN", label: "本人数据" },
  { value: "DEPT", label: "本部门" },
  { value: "DEPT_AND_CHILD", label: "本部门及下级" },
  { value: "PARTICIPATED", label: "参与过的数据" },
]

// 渲染用户管理操作表单。
export function AccessManagementActions({ data }: AccessManagementActionsProps) {
  const router = useRouter()
  const [message, setMessage] = useState<ActionState>(null)
  const [pendingAction, setPendingAction] = useState("")
  const [selectedUserId, setSelectedUserId] = useState(
    data.users[0]?.id.toString() ?? "",
  )
  const [selectedRoleId, setSelectedRoleId] = useState(
    data.roles[0]?.id.toString() ?? "",
  )
  const [selectedPermissionId, setSelectedPermissionId] = useState(
    data.permissions[0]?.id.toString() ?? "",
  )
  const [directEffect, setDirectEffect] = useState("ALLOW")
  const [directScope, setDirectScope] = useState("ALL")
  const [selectedUserRoleId, setSelectedUserRoleId] = useState("")
  const [selectedUserPermissionId, setSelectedUserPermissionId] = useState("")
  const [selectedRolePermissionId, setSelectedRolePermissionId] = useState("")

  const selectedUser = useMemo(
    () => data.users.find((user) => user.id.toString() === selectedUserId),
    [data.users, selectedUserId],
  )
  const selectedRole = useMemo(
    () => data.roles.find((role) => role.id.toString() === selectedRoleId),
    [data.roles, selectedRoleId],
  )
  const selectedUserRoles = selectedUser?.roles ?? []
  const selectedUserPermissions = selectedUser?.directPermissions ?? []
  const selectedRolePermissions = selectedRole?.permissions ?? []
  const selectedRolePermissionValue = selectedRolePermissions.some(
    (permission) => permission.id.toString() === selectedRolePermissionId,
  )
    ? selectedRolePermissionId
    : selectedRolePermissions[0]?.id.toString() ?? ""
  const selectedUserRoleValue = selectedUserRoles.some(
    (role) => role.id.toString() === selectedUserRoleId,
  )
    ? selectedUserRoleId
    : selectedUserRoles[0]?.id.toString() ?? ""
  const selectedUserPermissionValue = selectedUserPermissions.some(
    (permission) => permission.id.toString() === selectedUserPermissionId,
  )
    ? selectedUserPermissionId
    : selectedUserPermissions[0]?.id.toString() ?? ""

  // 切换用户时重置用户相关的解除项，避免拿旧用户的授权 id 去操作新用户。
  function handleSelectUser(userId: string) {
    const nextUser = data.users.find((user) => user.id.toString() === userId)

    setSelectedUserId(userId)
    setSelectedUserRoleId(nextUser?.roles[0]?.id.toString() ?? "")
    setSelectedUserPermissionId(nextUser?.directPermissions[0]?.id.toString() ?? "")
  }

  // 切换角色时重置角色已有权限选中项。
  function handleSelectRole(roleId: string) {
    const nextRole = data.roles.find((role) => role.id.toString() === roleId)

    setSelectedRoleId(roleId)
    setSelectedRolePermissionId(nextRole?.permissions[0]?.id.toString() ?? "")
  }

  async function handleAssignUserRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await runAction("assign-user-role", "角色分配成功", () =>
      requestJson(`/api/access-management/users/${selectedUserId}/roles`, {
        method: "POST",
        body: {
          roleId: Number(selectedRoleId),
        },
      }),
    )
  }

  // 解除当前用户选中的角色。
  async function handleRemoveUserRole() {
    if (!selectedUserRoleValue) {
      setMessage({ type: "error", message: "当前用户暂无可解除的角色" })
      return
    }

    await runAction("remove-user-role", "角色解除成功", () =>
      requestJson(
        `/api/access-management/users/${selectedUserId}/roles/${selectedUserRoleValue}`,
        { method: "DELETE" },
      ),
    )
  }

  async function handleAssignRolePermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await runAction("assign-role-permission", "角色权限分配成功", () =>
      requestJson(
        `/api/access-management/roles/${selectedRoleId}/permissions`,
        {
          method: "POST",
          body: {
            permissionId: Number(selectedPermissionId),
          },
        },
      ),
    )
  }

  // 解除当前角色选中的权限。
  async function handleRemoveRolePermission() {
    if (!selectedRole || !selectedRolePermissionValue) {
      setMessage({ type: "error", message: "当前角色暂无可解除的权限" })
      return
    }

    await runAction("remove-role-permission", "角色权限解除成功", () =>
      requestJson(
        `/api/access-management/roles/${selectedRoleId}/permissions/${selectedRolePermissionValue}`,
        { method: "DELETE" },
      ),
    )
  }

  async function handleAssignDirectPermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await runAction("assign-direct-permission", "用户直接授权成功", () =>
      requestJson(
        `/api/access-management/users/${selectedUserId}/permissions`,
        {
          method: "POST",
          body: {
            permissionId: Number(selectedPermissionId),
            effect: directEffect,
            scopeType: directScope,
          },
        },
      ),
    )
  }

  // 删除当前用户选中的直接授权。
  async function handleRemoveDirectPermission() {
    if (!selectedUserPermissionValue) {
      setMessage({ type: "error", message: "当前用户暂无可删除的直接授权" })
      return
    }

    await runAction("remove-direct-permission", "用户直接授权删除成功", () =>
      requestJson(
        `/api/access-management/users/${selectedUserId}/permissions/${selectedUserPermissionValue}`,
        { method: "DELETE" },
      ),
    )
  }

  async function runAction(
    action: string,
    successMessage: string,
    callback: () => Promise<void>,
  ) {
    if (pendingAction) {
      return
    }

    setPendingAction(action)
    setMessage(null)

    try {
      await callback()
      setMessage({ type: "success", message: successMessage })
      router.refresh()
    } catch (error) {
      setMessage({
        type: "error",
        message:
          error instanceof Error ? error.message : "操作失败，请稍后再试",
      })
    } finally {
      setPendingAction("")
    }
  }

  const disabled = !selectedUserId || !selectedRoleId || !selectedPermissionId

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">权限分配</CardTitle>
        {message ? (
          <p
            className={
              message.type === "success"
                ? "text-sm text-emerald-700"
                : "text-sm text-destructive"
            }
          >
            {message.message}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-3">
        <ActionForm title="用户角色" onSubmit={handleAssignUserRole}>
          <SelectField
            id="user-role-user"
            label="用户"
            value={selectedUserId}
            onChange={handleSelectUser}
            options={data.users.map((user) => ({
              value: user.id.toString(),
              label: `${user.name || user.email}（${user.email}）`,
            }))}
          />
          <SelectField
            id="user-role-role"
            label="角色"
            value={selectedRoleId}
            onChange={setSelectedRoleId}
            options={data.roles.map((role) => ({
              value: role.id.toString(),
              label: role.name,
            }))}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={disabled || Boolean(pendingAction)}
          >
            <PendingIcon active={pendingAction === "assign-user-role"} />
            分配角色
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!selectedUserRoleValue || Boolean(pendingAction)}
            onClick={() => {
              void handleRemoveUserRole()
            }}
          >
            解除选中角色
          </Button>
          <SelectField
            id="user-role-current"
            label="当前用户已有角色"
            value={selectedUserRoleValue}
            onChange={setSelectedUserRoleId}
            options={selectedUserRoles.map((role) => ({
              value: role.id.toString(),
              label: role.name,
            }))}
          />
        </ActionForm>

        <ActionForm title="角色权限" onSubmit={handleAssignRolePermission}>
          <SelectField
            id="role-permission-role"
            label="角色"
            value={selectedRoleId}
            onChange={handleSelectRole}
            options={data.roles.map((role) => ({
              value: role.id.toString(),
              label: role.name,
            }))}
          />
          <SelectField
            id="role-permission-permission"
            label="权限码"
            value={selectedPermissionId}
            onChange={setSelectedPermissionId}
            options={data.permissions.map((permission) => ({
              value: permission.id.toString(),
              label: permission.code,
            }))}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={disabled || Boolean(pendingAction)}
          >
            <PendingIcon active={pendingAction === "assign-role-permission"} />
            分配权限
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!selectedRolePermissionValue || Boolean(pendingAction)}
            onClick={() => {
              void handleRemoveRolePermission()
            }}
          >
            解除所选权限
          </Button>
          <SelectField
            id="role-permission-current"
            label="当前角色已有权限"
            value={selectedRolePermissionValue}
            onChange={setSelectedRolePermissionId}
            options={selectedRolePermissions.map((permission) => ({
              value: permission.id.toString(),
              label: permission.code,
            }))}
          />
        </ActionForm>

        <ActionForm title="用户直接授权" onSubmit={handleAssignDirectPermission}>
          <SelectField
            id="direct-user"
            label="用户"
            value={selectedUserId}
            onChange={handleSelectUser}
            options={data.users.map((user) => ({
              value: user.id.toString(),
              label: `${user.name || user.email}（${user.email}）`,
            }))}
          />
          <SelectField
            id="direct-permission"
            label="权限码"
            value={selectedPermissionId}
            onChange={setSelectedPermissionId}
            options={data.permissions.map((permission) => ({
              value: permission.id.toString(),
              label: permission.code,
            }))}
          />
          <SelectField
            id="direct-effect"
            label="效果"
            value={directEffect}
            onChange={setDirectEffect}
            options={effectOptions}
          />
          <SelectField
            id="direct-scope"
            label="数据范围"
            value={directScope}
            onChange={setDirectScope}
            options={scopeOptions}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={disabled || Boolean(pendingAction)}
          >
            <PendingIcon active={pendingAction === "assign-direct-permission"} />
            添加直接授权
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!selectedUserPermissionValue || Boolean(pendingAction)}
            onClick={() => {
              void handleRemoveDirectPermission()
            }}
          >
            删除选中直接授权
          </Button>
          <SelectField
            id="direct-current"
            label="当前用户已有直接授权"
            value={selectedUserPermissionValue}
            onChange={setSelectedUserPermissionId}
            options={selectedUserPermissions.map((permission) => ({
              value: permission.id.toString(),
              label: buildUserPermissionLabel(permission),
            }))}
          />
        </ActionForm>
      </CardContent>
    </Card>
  )
}

// 渲染操作表单容器。
function ActionForm({
  title,
  children,
  onSubmit,
}: {
  title: string
  children: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-muted/20 p-4"
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </form>
  )
}

// 构建用户直接授权下拉选项的展示文案。
function buildUserPermissionLabel(permission: AccessUserPermission) {
  return `${permission.effect}:${permission.permission.code}`
}

// 渲染选择框字段。
function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.length > 0 ? (
          options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        ) : (
          <option value="">暂无可选数据</option>
        )}
      </select>
    </div>
  )
}

// 渲染提交中的加载图标。
function PendingIcon({ active }: { active: boolean }) {
  if (!active) {
    return null
  }

  return <Loader2 className="size-4 animate-spin" aria-hidden />
}

// 请求用户管理 BFF 接口，并处理统一错误结构。
async function requestJson(
  url: string,
  options: { method: string; body?: unknown },
) {
  const response = await fetch(url, {
    method: options.method,
    headers: options.body
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = (await response.json()) as {
    code?: number
    message?: string
  }

  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "操作失败，请稍后再试")
  }
}
