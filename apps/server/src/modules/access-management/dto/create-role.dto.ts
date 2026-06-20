/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 创建角色请求 DTO，校验角色基础信息
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateRoleRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto implements CreateRoleRequestPayload {
  @ApiProperty({ example: 'department_leader' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ example: '部门负责人，管理本部门决策与成员权限' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desc?: string;
}
