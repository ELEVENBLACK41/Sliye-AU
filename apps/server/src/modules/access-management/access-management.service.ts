/*
 * @Description: 单组织访问控制管理服务，负责部门、角色、授权、用户状态与审计。
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  SYSTEM_PERMISSION_CODES,
  SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLES,
  type AccessAuditListResult,
  type AccessDepartmentTreeNode,
  type AccessPermission,
  type AccessRole,
  type AccessUser,
  type SystemPermissionCode,
} from '@workspace/contracts/access';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DepartmentStatus,
  PermissionEffect,
  PermissionKind,
  UserStatus,
  type Prisma,
} from '../../generated/prisma';
import { AuthorizationService } from '../auth/services/authorization.service';
import type {
  AuthorizationContext,
  RequestClientMeta,
} from '../auth/types/auth.types';
import {
  toAccessAuditLog,
  toAccessDepartmentTree,
  toAccessPermission,
  toAccessRole,
  toAccessUser,
} from './access-management.mapper';
import { AssignDepartmentToUserDto } from './dto/assign-department-to-user.dto';
import { AssignDirectPermissionToUserDto } from './dto/assign-direct-permission-to-user.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { MoveDepartmentDto } from './dto/move-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDepartmentStatusDto } from './dto/update-department-status.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

/** Prisma 角色详情统一加载结构。 */
const roleAccessInclude = {
  perms: {
    orderBy: [{ perm: { code: 'asc' } }, { scopeType: 'asc' }],
    include: { perm: true },
  },
  _count: {
    select: { users: true, perms: true },
  },
} satisfies Prisma.RoleInclude;

@Injectable()
export class AccessManagementService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 按操作者数据范围查询用户、角色和直接授权。 */
  async listUsers(actor: AuthorizationContext): Promise<AccessUser[]> {
    const where = await this.authorizationService.buildUserWhere(
      actor,
      'access:user:read',
    );
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      include: this.userAccessInclude(),
    });

    return users.map(toAccessUser);
  }

  /** 查询全部角色及其权限范围和关联数量。 */
  async listRoles(): Promise<AccessRole[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      include: roleAccessInclude,
    });

    return roles.map(toAccessRole);
  }

  /** 查询系统、历史和自定义权限目录。 */
  async listPermissions(): Promise<AccessPermission[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ kind: 'asc' }, { module: 'asc' }, { action: 'asc' }],
    });

    return permissions.map(toAccessPermission);
  }

  /** 按操作者数据范围查询部门树。 */
  async listDepartments(
    actor: AuthorizationContext,
  ): Promise<AccessDepartmentTreeNode[]> {
    const where = await this.authorizationService.buildDepartmentWhere(
      actor,
      'access:department:read',
    );
    const departments = await this.prisma.department.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: { users: true, decisions: true },
        },
      },
    });

    return toAccessDepartmentTree(departments);
  }

  /** 创建一个启用部门并记录访问控制审计。 */
  async createDepartment(
    actor: AuthorizationContext,
    dto: CreateDepartmentDto,
    meta: RequestClientMeta,
  ): Promise<AccessDepartmentTreeNode[]> {
    if (dto.parentId) {
      await this.authorizationService.assertDepartmentInScope(
        actor,
        'access:department:create',
        dto.parentId,
      );
    } else {
      this.assertRootDepartmentMutationAllowed(
        actor,
        'access:department:create',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          code: dto.code,
          name: dto.name,
          parentId: dto.parentId ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'DEPARTMENT_CREATED',
        targetType: 'DEPARTMENT',
        targetId: department.id.toString(),
        after: this.departmentSnapshot(department),
      });
    });

    return this.listDepartments(actor);
  }

  /** 更新授权范围内部门的名称或排序。 */
  async updateDepartment(
    actor: AuthorizationContext,
    departmentId: number,
    dto: UpdateDepartmentDto,
    meta: RequestClientMeta,
  ): Promise<AccessDepartmentTreeNode[]> {
    const before = await this.getDepartmentInScope(
      actor,
      'access:department:update',
      departmentId,
    );

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.department.update({
        where: { id: departmentId },
        data: {
          name: dto.name,
          sortOrder: dto.sortOrder,
        },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'DEPARTMENT_UPDATED',
        targetType: 'DEPARTMENT',
        targetId: departmentId.toString(),
        before: this.departmentSnapshot(before),
        after: this.departmentSnapshot(after),
      });
    });

    return this.listDepartments(actor);
  }

  /** 移动部门并拒绝移动到自身或任意下级部门。 */
  async moveDepartment(
    actor: AuthorizationContext,
    departmentId: number,
    dto: MoveDepartmentDto,
    meta: RequestClientMeta,
  ): Promise<AccessDepartmentTreeNode[]> {
    const before = await this.getDepartmentInScope(
      actor,
      'access:department:move',
      departmentId,
    );

    if (dto.parentId === departmentId) {
      this.throwDepartmentCycle();
    }

    if (dto.parentId) {
      await this.authorizationService.assertDepartmentInScope(
        actor,
        'access:department:move',
        dto.parentId,
      );
      const descendants =
        await this.authorizationService.getDepartmentTreeIds(departmentId);

      if (descendants.includes(dto.parentId)) {
        this.throwDepartmentCycle();
      }
    } else {
      this.assertRootDepartmentMutationAllowed(actor, 'access:department:move');
    }

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.department.update({
        where: { id: departmentId },
        data: {
          parentId: dto.parentId,
          sortOrder: dto.sortOrder,
        },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'DEPARTMENT_MOVED',
        targetType: 'DEPARTMENT',
        targetId: departmentId.toString(),
        before: this.departmentSnapshot(before),
        after: this.departmentSnapshot(after),
      });
    });

    return this.listDepartments(actor);
  }

  /** 更新部门启停状态，停用前要求没有启用下级和直接成员。 */
  async updateDepartmentStatus(
    actor: AuthorizationContext,
    departmentId: number,
    dto: UpdateDepartmentStatusDto,
    meta: RequestClientMeta,
  ): Promise<AccessDepartmentTreeNode[]> {
    const before = await this.getDepartmentInScope(
      actor,
      'access:department:update',
      departmentId,
    );

    if (dto.status === DepartmentStatus.DISABLED) {
      const [activeChildCount, memberCount] = await Promise.all([
        this.prisma.department.count({
          where: { parentId: departmentId, status: DepartmentStatus.ACTIVE },
        }),
        this.prisma.user.count({ where: { deptId: departmentId } }),
      ]);

      if (activeChildCount > 0 || memberCount > 0) {
        throw new BusinessException({
          code: API_ERROR_CODES.RESOURCE_CONFLICT,
          message: '停用部门前请先处理启用的下级部门和直属成员',
          status: 409,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.department.update({
        where: { id: departmentId },
        data: { status: DepartmentStatus[dto.status] },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'DEPARTMENT_STATUS_UPDATED',
        targetType: 'DEPARTMENT',
        targetId: departmentId.toString(),
        before: this.departmentSnapshot(before),
        after: this.departmentSnapshot(after),
      });
    });

    return this.listDepartments(actor);
  }

  /** 创建一个可由管理员维护的自定义角色。 */
  async createRole(
    actor: AuthorizationContext,
    dto: CreateRoleDto,
    meta: RequestClientMeta,
  ): Promise<AccessRole> {
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          desc: dto.desc,
          isSystem: false,
        },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'ROLE_CREATED',
        targetType: 'ROLE',
        targetId: created.id.toString(),
        after: this.roleSnapshot(created),
      });

      return created;
    });

    return this.getRole(role.id);
  }

  /** 更新自定义角色资料，系统角色只能通过代码目录同步。 */
  async updateRole(
    actor: AuthorizationContext,
    roleId: number,
    dto: UpdateRoleDto,
    meta: RequestClientMeta,
  ): Promise<AccessRole> {
    const before = await this.getMutableRole(roleId);

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.role.update({
        where: { id: roleId },
        data: { name: dto.name, desc: dto.desc },
      });

      await this.writeAudit(tx, actor, meta, {
        action: 'ROLE_UPDATED',
        targetType: 'ROLE',
        targetId: roleId.toString(),
        before: this.roleSnapshot(before),
        after: this.roleSnapshot(after),
      });
    });

    return this.getRole(roleId);
  }

  /** 删除没有用户绑定的自定义角色。 */
  async deleteRole(
    actor: AuthorizationContext,
    roleId: number,
    meta: RequestClientMeta,
  ): Promise<{ success: true }> {
    const role = await this.getMutableRole(roleId);
    const userCount = await this.prisma.userRole.count({ where: { roleId } });

    if (userCount > 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.RESOURCE_CONFLICT,
        message: '该角色仍有用户绑定，不能删除',
        status: 409,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: roleId } });
      await this.writeAudit(tx, actor, meta, {
        action: 'ROLE_DELETED',
        targetType: 'ROLE',
        targetId: roleId.toString(),
        before: this.roleSnapshot(role),
      });
    });

    return { success: true };
  }

  /** 为数据范围内的用户绑定一个允许分配的角色。 */
  async assignRoleToUser(
    actor: AuthorizationContext,
    userId: number,
    roleId: number,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    const user = await this.getUserInScope(
      actor,
      'access:user-role:assign',
      userId,
    );
    this.assertActorCanOperateUser(actor, user);
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { perms: { include: { perm: true } } },
    });

    if (!role) {
      this.throwNotFound('角色不存在');
    }

    this.assertRoleAssignable(actor, role.code);

    for (const grant of role.perms) {
      const permissionCode = this.asSystemPermissionCode(grant.perm.code);
      this.authorizationService.assertCanGrantScope(
        actor,
        permissionCode,
        grant.scopeType,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId },
      });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_ROLE_ASSIGNED',
        targetType: 'USER',
        targetId: userId.toString(),
        before: { roleCodes: user.roles.map(({ role: item }) => item.code) },
        after: { assignedRoleCode: role.code },
      });
    });

    return this.getUser(userId);
  }

  /** 解除用户角色，超级管理员角色禁止通过普通接口移除。 */
  async removeRoleFromUser(
    actor: AuthorizationContext,
    userId: number,
    roleId: number,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    const user = await this.getUserInScope(
      actor,
      'access:user-role:assign',
      userId,
    );
    this.assertActorCanOperateUser(actor, user);
    const role = await this.getRoleRecord(roleId);

    if (role.code === SYSTEM_ROLES.superAdmin) {
      this.throwSystemRoleProtected('超级管理员角色不能通过普通接口移除');
    }

    if (role.code === SYSTEM_ROLES.admin && !actor.isSuperAdmin) {
      this.throwSystemRoleProtected('只有超级管理员可以移除管理员角色');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, roleId } });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_ROLE_REMOVED',
        targetType: 'USER',
        targetId: userId.toString(),
        before: { removedRoleCode: role.code },
      });
    });

    return this.getUser(userId);
  }

  /** 为自定义角色增加一条系统权限数据范围授权。 */
  async assignPermissionToRole(
    actor: AuthorizationContext,
    roleId: number,
    permissionId: number,
    scopeType: DataScope,
    meta: RequestClientMeta,
  ): Promise<AccessRole> {
    await this.getMutableRole(roleId);
    const permission = await this.getSystemPermission(permissionId);
    const permissionCode = this.asSystemPermissionCode(permission.code);
    this.assertPermissionAllowsScope(permissionCode, scopeType);
    this.authorizationService.assertCanGrantScope(
      actor,
      permissionCode,
      scopeType,
    );

    await this.prisma.$transaction(async (tx) => {
      const grant = await tx.rolePermission.upsert({
        where: {
          roleId_permId_scopeType: { roleId, permId: permissionId, scopeType },
        },
        update: {},
        create: { roleId, permId: permissionId, scopeType },
      });
      await this.writeAudit(tx, actor, meta, {
        action: 'ROLE_PERMISSION_ASSIGNED',
        targetType: 'ROLE',
        targetId: roleId.toString(),
        after: {
          grantId: grant.id,
          permissionCode,
          scopeType,
        },
      });
    });

    return this.getRole(roleId);
  }

  /** 按授权记录 ID 删除自定义角色的一条权限范围。 */
  async removePermissionFromRole(
    actor: AuthorizationContext,
    roleId: number,
    grantId: number,
    meta: RequestClientMeta,
  ): Promise<AccessRole> {
    await this.getMutableRole(roleId);
    const grant = await this.prisma.rolePermission.findFirst({
      where: { id: grantId, roleId },
      include: { perm: true },
    });

    if (!grant) {
      this.throwNotFound('角色权限授权不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.delete({ where: { id: grant.id } });
      await this.writeAudit(tx, actor, meta, {
        action: 'ROLE_PERMISSION_REMOVED',
        targetType: 'ROLE',
        targetId: roleId.toString(),
        before: {
          grantId: grant.id,
          permissionCode: grant.perm.code,
          scopeType: grant.scopeType,
        },
      });
    });

    return this.getRole(roleId);
  }

  /** 为用户添加一条直接允许或全局拒绝授权。 */
  async assignDirectPermissionToUser(
    actor: AuthorizationContext,
    userId: number,
    dto: AssignDirectPermissionToUserDto,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    await this.getUserInScope(actor, 'access:user-permission:assign', userId);
    await this.assertTargetIsNotSuperAdmin(userId);
    const permission = await this.getSystemPermission(dto.permissionId);
    const permissionCode = this.asSystemPermissionCode(permission.code);
    const scopeType = DataScope[dto.scopeType];
    const effect = PermissionEffect[dto.effect];

    if (effect === PermissionEffect.DENY && scopeType !== DataScope.ALL) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '拒绝授权只能使用全部数据范围',
        status: 400,
        details: [{ field: 'scopeType', message: 'DENY 必须使用 ALL' }],
      });
    }

    this.assertPermissionAllowsScope(permissionCode, scopeType);
    this.authorizationService.assertCanGrantScope(
      actor,
      permissionCode,
      scopeType,
    );
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '授权过期时间必须晚于当前时间',
        status: 400,
        details: [{ field: 'expiresAt', message: '必须是未来时间' }],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const grant = await tx.userPermission.upsert({
        where: {
          userId_permId_effect_scopeType: {
            userId,
            permId: dto.permissionId,
            effect,
            scopeType,
          },
        },
        update: { expiresAt },
        create: {
          userId,
          permId: dto.permissionId,
          effect,
          scopeType,
          expiresAt,
        },
      });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_PERMISSION_ASSIGNED',
        targetType: 'USER',
        targetId: userId.toString(),
        after: {
          grantId: grant.id,
          permissionCode,
          effect,
          scopeType,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      });
    });

    return this.getUser(userId);
  }

  /** 删除用户的一条直接权限授权。 */
  async removeDirectPermissionFromUser(
    actor: AuthorizationContext,
    userId: number,
    grantId: number,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    await this.getUserInScope(actor, 'access:user-permission:assign', userId);
    await this.assertTargetIsNotSuperAdmin(userId);
    const grant = await this.prisma.userPermission.findFirst({
      where: { id: grantId, userId },
      include: { permission: true },
    });

    if (!grant) {
      this.throwNotFound('用户直接授权不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.delete({ where: { id: grant.id } });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_PERMISSION_REMOVED',
        targetType: 'USER',
        targetId: userId.toString(),
        before: {
          grantId: grant.id,
          permissionCode: grant.permission.code,
          effect: grant.effect,
          scopeType: grant.scopeType,
        },
      });
    });

    return this.getUser(userId);
  }

  /** 调整用户主部门并记录变更前后快照。 */
  async updateUserDepartment(
    actor: AuthorizationContext,
    userId: number,
    dto: AssignDepartmentToUserDto,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    if (
      actor.userId === userId &&
      dto.departmentId === null &&
      !actor.isSuperAdmin
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_PERMISSION_DENIED,
        message: '非超级管理员不能解绑自己的主部门',
        status: 403,
      });
    }

    const user = await this.getUserInScope(
      actor,
      'access:user:department:update',
      userId,
    );
    this.assertActorCanOperateUser(actor, user);

    if (dto.departmentId) {
      await this.authorizationService.assertDepartmentInScope(
        actor,
        'access:user:department:update',
        dto.departmentId,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deptId: dto.departmentId },
      });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_DEPARTMENT_UPDATED',
        targetType: 'USER',
        targetId: userId.toString(),
        before: { departmentId: user.deptId },
        after: { departmentId: dto.departmentId },
      });
    });

    return this.getUser(userId);
  }

  /** 更新用户状态，并防止停用最后一个有效超级管理员。 */
  async updateUserStatus(
    actor: AuthorizationContext,
    userId: number,
    dto: UpdateUserStatusDto,
    meta: RequestClientMeta,
  ): Promise<AccessUser> {
    const user = await this.getUserInScope(
      actor,
      'access:user:status:update',
      userId,
    );
    this.assertActorCanOperateUser(actor, user);
    const nextStatus = UserStatus[dto.status];

    if (nextStatus !== UserStatus.ACTIVE) {
      await this.assertNotLastActiveSuperAdmin(userId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: nextStatus },
      });
      await this.writeAudit(tx, actor, meta, {
        action: 'USER_STATUS_UPDATED',
        targetType: 'USER',
        targetId: userId.toString(),
        before: { status: user.status },
        after: { status: nextStatus },
      });
    });

    return this.getUser(userId);
  }

  /** 分页查询访问控制变更审计。 */
  async listAuditLogs(page = 1, pageSize = 50): Promise<AccessAuditListResult> {
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.min(100, Math.max(1, pageSize));
    const [items, total] = await this.prisma.$transaction([
      this.prisma.accessControlAuditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (normalizedPage - 1) * normalizedPageSize,
        take: normalizedPageSize,
        include: {
          actor: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.accessControlAuditLog.count(),
    ]);

    return {
      items: items.map(toAccessAuditLog),
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  /** 查询单个用户及其访问控制关系。 */
  private async getUser(userId: number): Promise<AccessUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.userAccessInclude(),
    });

    if (!user) {
      this.throwNotFound('用户不存在');
    }

    return toAccessUser(user);
  }

  /** 查询操作者数据范围内的目标用户。 */
  private async getUserInScope(
    actor: AuthorizationContext,
    permission: SystemPermissionCode,
    userId: number,
  ) {
    const scopeWhere = await this.authorizationService.buildUserWhere(
      actor,
      permission,
    );
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, scopeWhere] },
      include: this.userAccessInclude(),
    });

    if (!user) {
      this.throwNotFound('用户不存在或超出当前管理范围');
    }

    return user;
  }

  /** 查询单个角色及其授权和统计。 */
  private async getRole(roleId: number): Promise<AccessRole> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: roleAccessInclude,
    });

    if (!role) {
      this.throwNotFound('角色不存在');
    }

    return toAccessRole(role);
  }

  /** 查询角色基础记录。 */
  private async getRoleRecord(roleId: number) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!role) {
      this.throwNotFound('角色不存在');
    }

    return role;
  }

  /** 查询并断言角色是允许人工维护的自定义角色。 */
  private async getMutableRole(roleId: number) {
    const role = await this.getRoleRecord(roleId);

    if (role.isSystem) {
      this.throwSystemRoleProtected('系统角色只能通过代码目录同步');
    }

    return role;
  }

  /** 查询可人工授予的系统权限。 */
  private async getSystemPermission(permissionId: number) {
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission || permission.kind !== PermissionKind.SYSTEM) {
      this.throwNotFound('系统权限不存在或不允许继续授予');
    }

    return permission;
  }

  /** 查询操作者范围内的部门记录。 */
  private async getDepartmentInScope(
    actor: AuthorizationContext,
    permission: SystemPermissionCode,
    departmentId: number,
  ) {
    const scopeWhere = await this.authorizationService.buildDepartmentWhere(
      actor,
      permission,
    );
    const department = await this.prisma.department.findFirst({
      where: { AND: [{ id: departmentId }, scopeWhere] },
    });

    if (!department) {
      throw new BusinessException({
        code: API_ERROR_CODES.DEPARTMENT_NOT_FOUND,
        message: '部门不存在或超出当前管理范围',
        status: 404,
      });
    }

    return department;
  }

  /** 断言系统角色允许被当前操作者分配。 */
  private assertRoleAssignable(
    actor: AuthorizationContext,
    roleCode: string,
  ): void {
    if (roleCode === SYSTEM_ROLES.superAdmin) {
      this.throwSystemRoleProtected('超级管理员只能通过安全初始化流程指定');
    }

    if (roleCode === SYSTEM_ROLES.admin && !actor.isSuperAdmin) {
      this.throwSystemRoleProtected('只有超级管理员可以分配管理员角色');
    }
  }

  /** 断言目标用户不是超级管理员，避免普通授权覆盖超管。 */
  private async assertTargetIsNotSuperAdmin(userId: number): Promise<void> {
    const superAdmin = await this.prisma.userRole.findFirst({
      where: { userId, role: { code: SYSTEM_ROLES.superAdmin } },
      select: { userId: true },
    });

    if (superAdmin) {
      this.throwSystemRoleProtected('不能通过普通接口修改超级管理员直接权限');
    }
  }

  /**
   * 断言当前操作者可以维护目标用户。
   *
   * 普通管理员即使拥有全组织用户范围，也不得调整超级管理员的部门、状态或角色，
   * 防止多名超级管理员并存时出现“保留最后一个但仍可削弱其他超管”的越权路径。
   */
  private assertActorCanOperateUser(
    actor: AuthorizationContext,
    user: { roles: Array<{ role: { code: string } }> },
  ): void {
    const targetIsSuperAdmin = user.roles.some(
      ({ role }) => role.code === SYSTEM_ROLES.superAdmin,
    );

    if (targetIsSuperAdmin && !actor.isSuperAdmin) {
      this.throwSystemRoleProtected('普通管理员不能操作超级管理员账号');
    }
  }

  /** 断言目标用户不是系统内最后一个有效超级管理员。 */
  private async assertNotLastActiveSuperAdmin(userId: number): Promise<void> {
    const isTargetSuperAdmin = await this.prisma.userRole.findFirst({
      where: { userId, role: { code: SYSTEM_ROLES.superAdmin } },
      select: { userId: true },
    });

    if (!isTargetSuperAdmin) {
      return;
    }

    const activeSuperAdminCount = await this.prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { code: SYSTEM_ROLES.superAdmin } } },
      },
    });

    if (activeSuperAdminCount <= 1) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_LAST_SUPER_ADMIN_REQUIRED,
        message: '系统必须至少保留一个有效超级管理员',
        status: 409,
      });
    }
  }

  /** 断言系统权限目录允许使用目标数据范围。 */
  private assertPermissionAllowsScope(
    permissionCode: SystemPermissionCode,
    scopeType: DataScope,
  ): void {
    const definition = SYSTEM_PERMISSION_DEFINITIONS.find(
      (item) => item.code === permissionCode,
    );
    const allowedScopes: readonly string[] = definition?.allowedScopes ?? [];

    if (scopeType === DataScope.CUSTOM || !allowedScopes.includes(scopeType)) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '该权限不支持所选数据范围',
        status: 400,
        details: [{ field: 'scopeType', message: '数据范围与权限不兼容' }],
      });
    }
  }

  /** 把数据库权限码安全收窄为系统权限码。 */
  private asSystemPermissionCode(code: string): SystemPermissionCode {
    if (!SYSTEM_PERMISSION_CODES.includes(code as SystemPermissionCode)) {
      this.throwNotFound('权限码不在系统目录中');
    }

    return code as SystemPermissionCode;
  }

  /** 断言非超级管理员只能在已有部门范围内创建或移动根节点。 */
  private assertRootDepartmentMutationAllowed(
    actor: AuthorizationContext,
    permission: SystemPermissionCode,
  ): void {
    const scopes = this.authorizationService.getScopes(actor, permission);

    if (!actor.isSuperAdmin && !scopes.has(DataScope.ALL)) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有全组织范围管理员可以操作根部门',
        status: 403,
      });
    }
  }

  /** 抛出部门层级循环业务异常。 */
  private throwDepartmentCycle(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.DEPARTMENT_CYCLE_DETECTED,
      message: '部门不能移动到自身或下级部门',
      status: 409,
    });
  }

  /** 抛出系统角色保护业务异常。 */
  private throwSystemRoleProtected(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.ACCESS_SYSTEM_ROLE_PROTECTED,
      message,
      status: 403,
    });
  }

  /** 抛出通用资源不存在异常。 */
  private throwNotFound(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_NOT_FOUND,
      message,
      status: 404,
    });
  }

  /** 在当前数据库事务内写入访问控制变更审计。 */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuthorizationContext,
    meta: RequestClientMeta,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.accessControlAuditLog.create({
      data: {
        actorId: actor.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: meta.requestId ?? randomUUID(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        ...(input.before
          ? { before: input.before as Prisma.InputJsonObject }
          : {}),
        ...(input.after
          ? { after: input.after as Prisma.InputJsonObject }
          : {}),
      },
    });
  }

  /** 构造部门审计安全快照。 */
  private departmentSnapshot(department: {
    id: number;
    code: string;
    name: string;
    parentId: number | null;
    status: DepartmentStatus;
    sortOrder: number;
  }): Record<string, unknown> {
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      parentId: department.parentId,
      status: department.status,
      sortOrder: department.sortOrder,
    };
  }

  /** 构造角色审计安全快照。 */
  private roleSnapshot(role: {
    id: number;
    code: string;
    name: string;
    desc: string | null;
    isSystem: boolean;
  }): Record<string, unknown> {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      desc: role.desc,
      isSystem: role.isSystem,
    };
  }

  /** 统一维护用户管理接口需要加载的访问控制关系。 */
  private userAccessInclude() {
    return {
      department: true,
      roles: {
        orderBy: { assignedAt: 'asc' as const },
        include: { role: true },
      },
      permissions: {
        orderBy: { createdAt: 'asc' as const },
        include: { permission: true },
      },
    } satisfies Prisma.UserInclude;
  }
}
