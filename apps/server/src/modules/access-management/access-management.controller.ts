/*
 * @Description: 单组织用户、部门、角色、权限范围与授权审计管理接口。
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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentRequestMeta } from '../auth/decorators/request-meta.decorator';
import type {
  AuthorizationContext,
  RequestClientMeta,
} from '../auth/types/auth.types';
import { AccessManagementService } from './access-management.service';
import { AssignDepartmentToUserDto } from './dto/assign-department-to-user.dto';
import { AssignDirectPermissionToUserDto } from './dto/assign-direct-permission-to-user.dto';
import { AssignPermissionToRoleDto } from './dto/assign-permission-to-role.dto';
import { AssignRoleToUserDto } from './dto/assign-role-to-user.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { MoveDepartmentDto } from './dto/move-department.dto';
import { ListAccessAuditLogsDto } from './dto/list-access-audit-logs.dto';
import { ListAccessUsersDto } from './dto/list-access-users.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDepartmentStatusDto } from './dto/update-department-status.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ProjectAuditReadDto } from '../projects/dto/project-audit-read.dto';
import { ProjectAuditService } from '../projects/services/project-audit.service';

@ApiTags('access-management')
@ApiBearerAuth()
@Controller('access-management')
export class AccessManagementController {
  /** 注入访问控制管理服务。 */
  constructor(
    private readonly accessManagementService: AccessManagementService,
    private readonly projectAuditService: ProjectAuditService,
  ) {}

  /** 查询当前操作者数据范围内的用户及其授权。 */
  @Get('users')
  @RequirePermissions('access:user:read')
  @ApiOperation({ summary: '查询授权范围内的用户列表' })
  listUsers(
    @CurrentAuthorization() actor: AuthorizationContext,
    @Query() query: ListAccessUsersDto,
  ) {
    return this.accessManagementService.listUsers(actor, query);
  }

  /** 查询当前操作者数据范围内的单个用户及最终授权解析。 */
  @Get('users/:userId/authorization')
  @RequirePermissions('access:user:read')
  @ApiOperation({ summary: '查询用户完整授权解析' })
  getUserAuthorization(
    @CurrentAuthorization() actor: AuthorizationContext,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.accessManagementService.getUserAuthorization(actor, userId);
  }

  /** 查询角色列表及其权限范围。 */
  @Get('roles')
  @RequirePermissions('access:role:read')
  @ApiOperation({ summary: '查询角色列表' })
  listRoles() {
    return this.accessManagementService.listRoles();
  }

  /** 创建自定义角色。 */
  @Post('roles')
  @RequirePermissions('access:role:create')
  @ApiOperation({ summary: '创建自定义角色' })
  createRole(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Body() body: CreateRoleDto,
  ) {
    return this.accessManagementService.createRole(actor, body, meta);
  }

  /** 更新自定义角色中文资料。 */
  @Patch('roles/:roleId')
  @RequirePermissions('access:role:update')
  @ApiOperation({ summary: '更新自定义角色' })
  updateRole(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: UpdateRoleDto,
  ) {
    return this.accessManagementService.updateRole(actor, roleId, body, meta);
  }

  /** 删除未绑定用户的自定义角色。 */
  @Delete('roles/:roleId')
  @HttpCode(200)
  @RequirePermissions('access:role:update')
  @ApiOperation({ summary: '删除自定义角色' })
  deleteRole(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.accessManagementService.deleteRole(actor, roleId, meta);
  }

  /** 查询只读权限目录。 */
  @Get('permissions')
  @RequirePermissions('access:permission:read')
  @ApiOperation({ summary: '查询系统与遗留权限目录' })
  listPermissions() {
    return this.accessManagementService.listPermissions();
  }

  /** 查询当前操作者可见的部门树。 */
  @Get('departments')
  @RequirePermissions('access:department:read')
  @ApiOperation({ summary: '查询授权范围内的部门树' })
  listDepartments(@CurrentAuthorization() actor: AuthorizationContext) {
    return this.accessManagementService.listDepartments(actor);
  }

  /** 创建部门。 */
  @Post('departments')
  @RequirePermissions('access:department:create')
  @ApiOperation({ summary: '创建部门' })
  createDepartment(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Body() body: CreateDepartmentDto,
  ) {
    return this.accessManagementService.createDepartment(actor, body, meta);
  }

  /** 更新部门资料。 */
  @Patch('departments/:departmentId')
  @RequirePermissions('access:department:update')
  @ApiOperation({ summary: '更新部门资料' })
  updateDepartment(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: UpdateDepartmentDto,
  ) {
    return this.accessManagementService.updateDepartment(
      actor,
      departmentId,
      body,
      meta,
    );
  }

  /** 移动部门节点。 */
  @Patch('departments/:departmentId/move')
  @RequirePermissions('access:department:move')
  @ApiOperation({ summary: '移动部门节点' })
  moveDepartment(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: MoveDepartmentDto,
  ) {
    return this.accessManagementService.moveDepartment(
      actor,
      departmentId,
      body,
      meta,
    );
  }

  /** 更新部门启停状态。 */
  @Patch('departments/:departmentId/status')
  @RequirePermissions('access:department:update')
  @ApiOperation({ summary: '更新部门启停状态' })
  updateDepartmentStatus(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: UpdateDepartmentStatusDto,
  ) {
    return this.accessManagementService.updateDepartmentStatus(
      actor,
      departmentId,
      body,
      meta,
    );
  }

  /** 为用户绑定角色。 */
  @Post('users/:userId/roles')
  @RequirePermissions('access:user-role:assign')
  @ApiOperation({ summary: '为用户绑定角色' })
  assignRoleToUser(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: AssignRoleToUserDto,
  ) {
    return this.accessManagementService.assignRoleToUser(
      actor,
      userId,
      body.roleId,
      meta,
    );
  }

  /** 解除用户角色。 */
  @Delete('users/:userId/roles/:roleId')
  @HttpCode(200)
  @RequirePermissions('access:user-role:assign')
  @ApiOperation({ summary: '解除用户角色' })
  removeRoleFromUser(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.accessManagementService.removeRoleFromUser(
      actor,
      userId,
      roleId,
      meta,
    );
  }

  /** 为自定义角色增加权限范围。 */
  @Post('roles/:roleId/permissions')
  @RequirePermissions('access:role-permission:assign')
  @ApiOperation({ summary: '为自定义角色增加权限范围' })
  assignPermissionToRole(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: AssignPermissionToRoleDto,
  ) {
    return this.accessManagementService.assignPermissionToRole(
      actor,
      roleId,
      body.permissionId,
      body.scopeType,
      meta,
    );
  }

  /** 按授权记录 ID 删除角色权限范围。 */
  @Delete('roles/:roleId/permissions/:grantId')
  @HttpCode(200)
  @RequirePermissions('access:role-permission:assign')
  @ApiOperation({ summary: '删除自定义角色权限范围' })
  removePermissionFromRole(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('grantId', ParseIntPipe) grantId: number,
  ) {
    return this.accessManagementService.removePermissionFromRole(
      actor,
      roleId,
      grantId,
      meta,
    );
  }

  /** 为用户添加直接允许或全局拒绝。 */
  @Post('users/:userId/permissions')
  @RequirePermissions('access:user-permission:assign')
  @ApiOperation({ summary: '为用户添加直接权限' })
  assignDirectPermissionToUser(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: AssignDirectPermissionToUserDto,
  ) {
    return this.accessManagementService.assignDirectPermissionToUser(
      actor,
      userId,
      body,
      meta,
    );
  }

  /** 删除用户直接权限。 */
  @Delete('users/:userId/permissions/:grantId')
  @HttpCode(200)
  @RequirePermissions('access:user-permission:assign')
  @ApiOperation({ summary: '删除用户直接权限' })
  removeDirectPermissionFromUser(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('grantId', ParseIntPipe) grantId: number,
  ) {
    return this.accessManagementService.removeDirectPermissionFromUser(
      actor,
      userId,
      grantId,
      meta,
    );
  }

  /** 调整用户主部门。 */
  @Patch('users/:userId/department')
  @RequirePermissions('access:user:department:update')
  @ApiOperation({ summary: '调整用户主部门' })
  updateUserDepartment(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: AssignDepartmentToUserDto,
  ) {
    return this.accessManagementService.updateUserDepartment(
      actor,
      userId,
      body,
      meta,
    );
  }

  /** 更新用户账号状态。 */
  @Patch('users/:userId/status')
  @RequirePermissions('access:user:status:update')
  @ApiOperation({ summary: '更新用户账号状态' })
  updateUserStatus(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.accessManagementService.updateUserStatus(
      actor,
      userId,
      body,
      meta,
    );
  }

  /** 查询最近的访问控制配置变更审计。 */
  @Get('audit-logs')
  @RequirePermissions('access:audit:read')
  @ApiOperation({ summary: '查询访问控制变更审计' })
  listAuditLogs(@Query() query: ListAccessAuditLogsDto) {
    return this.accessManagementService.listAuditLogs(query);
  }

  /** 通过独立审计入口只读访问私有分区或私有会议消息。 */
  @Post('project-audits/private-content')
  @RequirePermissions('project:audit:read')
  @ApiOperation({ summary: '审计读取私有项目内容' })
  readPrivateProjectContent(
    @CurrentAuthorization() actor: AuthorizationContext,
    @CurrentRequestMeta() meta: RequestClientMeta,
    @Body() body: ProjectAuditReadDto,
  ) {
    return this.projectAuditService.readPrivateContent(actor, body, meta);
  }
}
