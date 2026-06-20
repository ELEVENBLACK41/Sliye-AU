/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 更新角色请求 DTO，允许局部更新角色基础信息
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateRoleRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleDto implements UpdateRoleRequestPayload {
  @ApiPropertyOptional({ example: 'department_leader' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: '部门负责人，管理本部门决策与成员权限' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desc?: string;
}
