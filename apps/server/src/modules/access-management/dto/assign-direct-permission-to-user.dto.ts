/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户直接授权请求 DTO，校验权限、效果和数据范围
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AccessDataScope,
  AccessPermissionEffect,
  AssignDirectPermissionToUserRequestPayload,
} from '@workspace/contracts/access';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

const permissionEffects: AccessPermissionEffect[] = ['ALLOW', 'DENY'];
const dataScopes: AccessDataScope[] = [
  'ALL',
  'OWN',
  'DEPT',
  'DEPT_AND_CHILD',
  'PARTICIPATED',
  'CUSTOM',
];

export class AssignDirectPermissionToUserDto implements AssignDirectPermissionToUserRequestPayload {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  permissionId!: number;

  @ApiPropertyOptional({ example: 'ALLOW', enum: permissionEffects })
  @IsOptional()
  @IsIn(permissionEffects)
  effect?: AccessPermissionEffect;

  @ApiPropertyOptional({ example: 'DEPT', enum: dataScopes })
  @IsOptional()
  @IsIn(dataScopes)
  scopeType?: AccessDataScope;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
