/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理服务，负责 RBAC 基础关系的数据访问与维护
 * @Copyright: Copyright 1990 - 2026
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccessPermission,
  AccessRole,
  AccessUser,
} from '@workspace/contracts/access';
import { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  PermissionEffect,
  type Prisma,
} from '../../generated/prisma';
import {
  toAccessPermission,
  toAccessRole,
  toAccessUser,
} from './access-management.mapper';
import { AssignDirectPermissionToUserDto } from './dto/assign-direct-permission-to-user.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class AccessManagementService {
  // 注入 Prisma 服务以维护用户、角色和权限关系。
  constructor(private readonly prisma: PrismaService) {}

  // 查询用户列表，并携带用户已绑定角色和用户级直接授权。
  async listUsers(): Promise<AccessUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: this.userAccessInclude(),
    });

    return users.map(toAccessUser);
  }

  // 查询角色列表，并返回角色关联的权限数和用户数。
  async listRoles(): Promise<AccessRole[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            perms: true,
          },
        },
      },
    });

    return roles.map(toAccessRole);
  }

  // 创建一个稳定的权限包角色。
  async createRole(dto: CreateRoleDto): Promise<AccessRole> {
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        desc: dto.desc,
      },
      include: {
        _count: {
          select: {
            users: true,
            perms: true,
          },
        },
      },
    });

    return toAccessRole(role);
  }

  // 更新角色基础信息。
  async updateRole(roleId: number, dto: UpdateRoleDto): Promise<AccessRole> {
    await this.assertRoleExists(roleId);

    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name,
        desc: dto.desc,
      },
      include: {
        _count: {
          select: {
            users: true,
            perms: true,
          },
        },
      },
    });

    return toAccessRole(role);
  }

  // 查询权限列表，按模块和动作排序方便前端分组展示。
  async listPermissions(): Promise<AccessPermission[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }, { id: 'asc' }],
    });

    return permissions.map(toAccessPermission);
  }

  // 创建权限码，权限码用于后续角色和用户级授权。
  async createPermission(dto: CreatePermissionDto): Promise<AccessPermission> {
    this.assertPermissionCodeMatchesModuleAndAction(dto);

    const permission = await this.prisma.permission.create({
      data: {
        code: dto.code,
        name: dto.name,
        module: dto.module,
        action: dto.action,
        desc: dto.desc,
      },
    });

    return toAccessPermission(permission);
  }

  // 为用户绑定角色，重复绑定时保持幂等。
  async assignRoleToUser(userId: number, roleId: number): Promise<AccessUser> {
    await this.assertUserExists(userId);
    await this.assertRoleExists(roleId);

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
      update: {},
      create: {
        userId,
        roleId,
      },
    });

    return this.getUser(userId);
  }

  // 解除用户角色绑定。
  async removeRoleFromUser(
    userId: number,
    roleId: number,
  ): Promise<AccessUser> {
    await this.assertUserExists(userId);

    await this.prisma.userRole.deleteMany({
      where: {
        userId,
        roleId,
      },
    });

    return this.getUser(userId);
  }

  // 为角色绑定权限，重复绑定时保持幂等。
  async assignPermissionToRole(
    roleId: number,
    permissionId: number,
  ): Promise<AccessRole> {
    await this.assertRoleExists(roleId);
    await this.assertPermissionExists(permissionId);

    await this.prisma.rolePermission.upsert({
      where: {
        roleId_permId: {
          roleId,
          permId: permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permId: permissionId,
      },
    });

    return this.getRole(roleId);
  }

  // 解除角色和权限的绑定关系。
  async removePermissionFromRole(
    roleId: number,
    permissionId: number,
  ): Promise<AccessRole> {
    await this.assertRoleExists(roleId);

    await this.prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permId: permissionId,
      },
    });

    return this.getRole(roleId);
  }

  // 给用户添加直接授权或直接拒绝，作为角色之外的少量例外。
  async assignDirectPermissionToUser(
    userId: number,
    dto: AssignDirectPermissionToUserDto,
  ): Promise<AccessUser> {
    await this.assertUserExists(userId);
    await this.assertPermissionExists(dto.permissionId);

    const effect = dto.effect ?? PermissionEffect.ALLOW;
    const scopeType = dto.scopeType ? DataScope[dto.scopeType] : DataScope.ALL;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    await this.prisma.userPermission.upsert({
      where: {
        userId_permId_effect_scopeType: {
          userId,
          permId: dto.permissionId,
          effect,
          scopeType,
        },
      },
      update: {
        expiresAt,
      },
      create: {
        userId,
        permId: dto.permissionId,
        effect,
        scopeType,
        expiresAt,
      },
    });

    return this.getUser(userId);
  }

  // 删除用户级直接授权或拒绝。
  async removeDirectPermissionFromUser(
    userId: number,
    userPermissionId: number,
  ): Promise<AccessUser> {
    await this.assertUserExists(userId);

    await this.prisma.userPermission.deleteMany({
      where: {
        id: userPermissionId,
        userId,
      },
    });

    return this.getUser(userId);
  }

  // 查询单个用户及其访问控制关系。
  private async getUser(userId: number): Promise<AccessUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.userAccessInclude(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toAccessUser(user);
  }

  // 查询单个角色及统计信息。
  private async getRole(roleId: number): Promise<AccessRole> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: {
            users: true,
            perms: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return toAccessRole(role);
  }

  // 断言用户存在。
  private async assertUserExists(userId: number): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  // 断言角色存在。
  private async assertRoleExists(roleId: number): Promise<void> {
    const exists = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Role not found');
    }
  }

  // 断言权限存在。
  private async assertPermissionExists(permissionId: number): Promise<void> {
    const exists = await this.prisma.permission.findUnique({
      where: { id: permissionId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Permission not found');
    }
  }

  // 校验权限 code 是否和 module/action 保持一致，避免权限码语义漂移。
  private assertPermissionCodeMatchesModuleAndAction(
    dto: CreatePermissionDto,
  ): void {
    const expectedCode = `${dto.module}:${dto.action}`;

    if (dto.code !== expectedCode) {
      throw new ConflictException(
        `Permission code must match module:action, expected ${expectedCode}`,
      );
    }
  }

  // 统一维护用户管理接口需要加载的访问控制关系。
  private userAccessInclude() {
    return {
      department: {
        select: {
          name: true,
        },
      },
      roles: {
        orderBy: {
          assignedAt: 'asc',
        },
        include: {
          role: true,
        },
      },
      permissions: {
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          permission: true,
        },
      },
    } satisfies Prisma.UserInclude;
  }
}
