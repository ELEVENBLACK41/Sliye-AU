/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 角色绑定权限请求 DTO，校验目标权限 ID
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AssignPermissionToRoleRequestPayload } from '@workspace/contracts/access';
import { IsInt, Min } from 'class-validator';

export class AssignPermissionToRoleDto implements AssignPermissionToRoleRequestPayload {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  permissionId!: number;
}
