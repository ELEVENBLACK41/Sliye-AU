/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户绑定角色请求 DTO，校验目标角色 ID
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AssignRoleToUserRequestPayload } from '@workspace/contracts/access';
import { IsInt, Min } from 'class-validator';

export class AssignRoleToUserDto implements AssignRoleToUserRequestPayload {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  roleId!: number;
}
