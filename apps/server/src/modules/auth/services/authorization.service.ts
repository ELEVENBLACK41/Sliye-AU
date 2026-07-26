/*
 * @Description: 统一授权服务，负责权限合并、数据范围计算与 Prisma 查询条件生成。
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  SYSTEM_PERMISSION_CODES,
  type SystemPermissionCode,
} from '@workspace/contracts/access';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DataScope,
  DepartmentStatus,
  PermissionEffect,
  type Prisma,
} from '../../../generated/prisma';
import type {
  AuthorizationContext,
  AuthorizationUserRecord,
} from '../types/auth.types';

/** 超级管理员系统角色的稳定代码。 */
export const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

/** 授权失败时返回的无匹配 Prisma 条件。 */
const IMPOSSIBLE_RECORD_ID = -1;

@Injectable()
export class AuthorizationService {
  /** 注入 Prisma，用于实时解析部门树。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 合并角色权限与用户直接授权，生成请求级授权上下文。
   *
   * 用户级、未过期的 DENY 会全局移除同一权限码；ALLOW 的多个范围按并集合并。
   */
  buildContext(user: AuthorizationUserRecord): AuthorizationContext {
    const now = Date.now();
    const deniedPermissions = new Set(
      user.directGrants
        .filter(
          (grant) =>
            grant.effect === PermissionEffect.DENY &&
            (!grant.expiresAt || grant.expiresAt.getTime() > now),
        )
        .map((grant) => grant.code),
    );
    const mutableGrants = new Map<string, Set<DataScope>>();

    for (const grant of user.roleGrants) {
      this.addScope(mutableGrants, grant.code, grant.scopeType);
    }

    for (const grant of user.directGrants) {
      const isActive = !grant.expiresAt || grant.expiresAt.getTime() > now;

      if (isActive && grant.effect === PermissionEffect.ALLOW) {
        this.addScope(mutableGrants, grant.code, grant.scopeType);
      }
    }

    for (const deniedCode of deniedPermissions) {
      mutableGrants.delete(deniedCode);
    }

    return {
      userId: user.id,
      deptId: user.deptId,
      isSuperAdmin: user.roleCodes.includes(SUPER_ADMIN_ROLE_CODE),
      roleCodes: new Set(user.roleCodes),
      deniedPermissions,
      grants: mutableGrants,
    };
  }

  /** 返回当前上下文最终拥有的系统权限码，供认证资料和 Web 展示控制使用。 */
  getEffectiveSystemPermissionCodes(
    context: AuthorizationContext,
  ): SystemPermissionCode[] {
    if (context.isSuperAdmin) {
      return [...SYSTEM_PERMISSION_CODES];
    }

    return SYSTEM_PERMISSION_CODES.filter((code) => context.grants.has(code));
  }

  /** 判断当前上下文是否拥有指定权限码。 */
  hasPermission(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
  ): boolean {
    return context.isSuperAdmin || context.grants.has(permission);
  }

  /** 判断当前上下文是否同时拥有全部权限码。 */
  hasAllPermissions(
    context: AuthorizationContext,
    permissions: readonly SystemPermissionCode[],
  ): boolean {
    return permissions.every((permission) =>
      this.hasPermission(context, permission),
    );
  }

  /** 判断当前上下文是否拥有任意一个权限码。 */
  hasAnyPermission(
    context: AuthorizationContext,
    permissions: readonly SystemPermissionCode[],
  ): boolean {
    return permissions.some((permission) =>
      this.hasPermission(context, permission),
    );
  }

  /** 断言当前用户拥有指定系统权限。 */
  assertPermission(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
  ): void {
    if (!this.hasPermission(context, permission)) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_PERMISSION_DENIED,
        message: '当前账号没有执行该操作的权限',
        status: 403,
      });
    }
  }

  /** 获取指定权限码当前可用的数据范围。 */
  getScopes(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
  ): ReadonlySet<DataScope> {
    if (context.isSuperAdmin) {
      return new Set([DataScope.ALL]);
    }

    return context.grants.get(permission) ?? new Set<DataScope>();
  }

  /**
   * 断言操作者可以把指定权限范围授予其他用户或角色。
   *
   * ALL 可覆盖全部范围，部门树范围可下放为本部门范围；OWN 与 PARTICIPATED
   * 互不包含，避免把不相干的资源语义错误地视为更大范围。
   */
  assertCanGrantScope(
    actor: AuthorizationContext,
    permission: SystemPermissionCode,
    targetScope: DataScope,
  ): void {
    if (actor.isSuperAdmin) {
      return;
    }

    const actorScopes = this.getScopes(actor, permission);
    const allowed = [...actorScopes].some((actorScope) =>
      this.scopeIncludes(actorScope, targetScope),
    );

    if (!allowed) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_GRANT_EXCEEDS_ACTOR,
        message: '不能授予当前账号自身不具备的权限范围',
        status: 403,
      });
    }
  }

  /** 根据数据范围生成决策列表和详情查询条件。 */
  buildDecisionWhere(
    context: AuthorizationContext,
    _permission: SystemPermissionCode,
  ): Promise<Prisma.DecisionWhereInput> {
    void _permission;
    return Promise.resolve({
      AND: [
        {
          matter: {
            members: {
              some: { userId: context.userId },
            },
          },
        },
        {
          OR: [
            { areaId: null },
            {
              area: {
                is: {
                  OR: [
                    { type: 'PUBLIC' },
                    { members: { some: { userId: context.userId } } },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
  }

  /** 根据数据范围生成用户管理列表和目标用户查询条件。 */
  async buildUserWhere(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
  ): Promise<Prisma.UserWhereInput> {
    const scopes = this.getScopes(context, permission);

    if (scopes.has(DataScope.ALL)) {
      return {};
    }

    const conditions: Prisma.UserWhereInput[] = [];

    if (scopes.has(DataScope.OWN)) {
      conditions.push({ id: context.userId });
    }

    if (scopes.has(DataScope.DEPT) && context.deptId) {
      conditions.push({ deptId: context.deptId });
    }

    if (scopes.has(DataScope.DEPT_AND_CHILD) && context.deptId) {
      conditions.push({
        deptId: {
          in: await this.getDepartmentTreeIds(context.deptId),
        },
      });
    }

    return conditions.length > 0
      ? { OR: conditions }
      : { id: IMPOSSIBLE_RECORD_ID };
  }

  /** 根据数据范围生成部门树可见范围。 */
  async buildDepartmentWhere(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
  ): Promise<Prisma.DepartmentWhereInput> {
    const scopes = this.getScopes(context, permission);

    if (scopes.has(DataScope.ALL)) {
      return {};
    }

    if (!context.deptId) {
      return { id: IMPOSSIBLE_RECORD_ID };
    }

    if (scopes.has(DataScope.DEPT_AND_CHILD)) {
      return {
        id: {
          in: await this.getDepartmentTreeIds(context.deptId),
        },
      };
    }

    if (scopes.has(DataScope.DEPT)) {
      return { id: context.deptId };
    }

    return { id: IMPOSSIBLE_RECORD_ID };
  }

  /** 断言指定部门位于当前权限的数据范围内且处于启用状态。 */
  async assertDepartmentInScope(
    context: AuthorizationContext,
    permission: SystemPermissionCode,
    departmentId: number,
  ): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, status: true },
    });

    if (!department) {
      throw new BusinessException({
        code: API_ERROR_CODES.DEPARTMENT_NOT_FOUND,
        message: '部门不存在',
        status: 404,
      });
    }

    if (department.status !== DepartmentStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.DEPARTMENT_DISABLED,
        message: '目标部门已停用',
        status: 409,
      });
    }

    const where = await this.buildDepartmentWhere(context, permission);
    const visible = await this.prisma.department.findFirst({
      where: {
        AND: [{ id: departmentId }, where],
      },
      select: { id: true },
    });

    if (!visible) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '目标部门超出当前账号的数据范围',
        status: 403,
      });
    }
  }

  /** 返回指定部门及其全部启用下级部门 ID。 */
  async getDepartmentTreeIds(departmentId: number): Promise<number[]> {
    const departments = await this.prisma.department.findMany({
      select: { id: true, parentId: true },
    });
    const result = new Set<number>([departmentId]);
    let added = true;

    while (added) {
      added = false;

      for (const department of departments) {
        if (
          department.parentId &&
          result.has(department.parentId) &&
          !result.has(department.id)
        ) {
          result.add(department.id);
          added = true;
        }
      }
    }

    return [...result];
  }

  /** 向权限范围映射中追加一个数据范围。 */
  private addScope(
    grants: Map<string, Set<DataScope>>,
    code: string,
    scope: DataScope,
  ): void {
    const scopes = grants.get(code) ?? new Set<DataScope>();

    scopes.add(scope);
    grants.set(code, scopes);
  }

  /** 判断操作者范围是否包含待授予范围。 */
  private scopeIncludes(actor: DataScope, target: DataScope): boolean {
    if (actor === DataScope.ALL) {
      return true;
    }

    if (actor === DataScope.DEPT_AND_CHILD) {
      return target === DataScope.DEPT_AND_CHILD || target === DataScope.DEPT;
    }

    return actor === target;
  }
}

/**
 * 当请求缺少授权上下文时抛出统一禁止访问异常。
 *
 * 该函数用于守卫内部的防御性分支；正常情况下全局认证守卫会先写入上下文。
 */
export function throwMissingAuthorizationContext(): never {
  throw new ForbiddenException('请求缺少授权上下文');
}
