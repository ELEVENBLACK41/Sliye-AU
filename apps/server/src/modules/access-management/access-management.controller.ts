/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理控制器，提供 RBAC 基础管理接口
 * @Copyright: Copyright 1990 - 2026
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCESS_MANAGEMENT_PERMISSIONS } from '@workspace/contracts/access';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { AccessManagementService } from './access-management.service';
import { AssignDirectPermissionToUserDto } from './dto/assign-direct-permission-to-user.dto';
import { AssignPermissionToRoleDto } from './dto/assign-permission-to-role.dto';
import { AssignRoleToUserDto } from './dto/assign-role-to-user.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('access-management')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, PermissionGuard)
@Controller('access-management')
export class AccessManagementController {
  // 注入访问控制管理服务。
  constructor(
    private readonly accessManagementService: AccessManagementService,
  ) {}

  // 查询用户及其角色、直接授权。
  @Get('users')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.read)
  @ApiOperation({ summary: '查询用户管理列表' })
  listUsers() {
    return this.accessManagementService.listUsers();
  }

  // 查询角色列表。
  @Get('roles')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.read)
  @ApiOperation({ summary: '查询角色列表' })
  listRoles() {
    return this.accessManagementService.listRoles();
  }

  // 创建角色。
  @Post('roles')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '创建角色' })
  createRole(@Body() body: CreateRoleDto) {
    return this.accessManagementService.createRole(body);
  }

  // 更新角色。
  @Patch('roles/:roleId')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '更新角色' })
  updateRole(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: UpdateRoleDto,
  ) {
    return this.accessManagementService.updateRole(roleId, body);
  }

  // 查询权限码列表。
  @Get('permissions')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.read)
  @ApiOperation({ summary: '查询权限列表' })
  listPermissions() {
    return this.accessManagementService.listPermissions();
  }

  // 创建权限码。
  @Post('permissions')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '创建权限' })
  createPermission(@Body() body: CreatePermissionDto) {
    return this.accessManagementService.createPermission(body);
  }

  // 为用户绑定角色。
  @Post('users/:userId/roles')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '为用户绑定角色' })
  assignRoleToUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: AssignRoleToUserDto,
  ) {
    return this.accessManagementService.assignRoleToUser(userId, body.roleId);
  }

  // 解除用户角色绑定。
  @Delete('users/:userId/roles/:roleId')
  @HttpCode(200)
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '解除用户角色绑定' })
  removeRoleFromUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.accessManagementService.removeRoleFromUser(userId, roleId);
  }

  // 为角色绑定权限。
  @Post('roles/:roleId/permissions')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '为角色绑定权限' })
  assignPermissionToRole(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: AssignPermissionToRoleDto,
  ) {
    return this.accessManagementService.assignPermissionToRole(
      roleId,
      body.permissionId,
    );
  }

  // 解除角色权限绑定。
  @Delete('roles/:roleId/permissions/:permissionId')
  @HttpCode(200)
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '解除角色权限绑定' })
  removePermissionFromRole(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) {
    return this.accessManagementService.removePermissionFromRole(
      roleId,
      permissionId,
    );
  }

  // 给用户添加直接授权或拒绝。
  @Post('users/:userId/permissions')
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '为用户添加直接授权或拒绝' })
  assignDirectPermissionToUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: AssignDirectPermissionToUserDto,
  ) {
    return this.accessManagementService.assignDirectPermissionToUser(
      userId,
      body,
    );
  }

  // 删除用户级直接授权或拒绝。
  @Delete('users/:userId/permissions/:userPermissionId')
  @HttpCode(200)
  @RequirePermissions(ACCESS_MANAGEMENT_PERMISSIONS.write)
  @ApiOperation({ summary: '删除用户级直接授权或拒绝' })
  removeDirectPermissionFromUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('userPermissionId', ParseIntPipe) userPermissionId: number,
  ) {
    return this.accessManagementService.removeDirectPermissionFromUser(
      userId,
      userPermissionId,
    );
  }
}
