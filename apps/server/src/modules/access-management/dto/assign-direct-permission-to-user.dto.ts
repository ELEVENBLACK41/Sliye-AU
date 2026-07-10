/*
 * @Description: 用户直接授权或全局拒绝 DTO，CUSTOM 范围本期不对外开放。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AccessPermissionEffect,
  AssignDirectPermissionToUserRequestPayload,
  GrantableDataScope,
} from '@workspace/contracts/access';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

/** 用户直接权限支持的效果。 */
const permissionEffects: AccessPermissionEffect[] = ['ALLOW', 'DENY'];

/** 本期允许授予的稳定数据范围。 */
const grantableScopes: GrantableDataScope[] = [
  'ALL',
  'OWN',
  'DEPT',
  'DEPT_AND_CHILD',
  'PARTICIPATED',
];

/** 用户直接授权的运行时校验 DTO。 */
export class AssignDirectPermissionToUserDto implements AssignDirectPermissionToUserRequestPayload {
  /** 系统权限主键。 */
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  permissionId!: number;

  /** 授权或全局拒绝效果。 */
  @ApiProperty({ example: 'ALLOW', enum: permissionEffects })
  @IsIn(permissionEffects)
  effect!: AccessPermissionEffect;

  /** 授权数据范围；DENY 时业务层只允许 ALL。 */
  @ApiProperty({ example: 'DEPT', enum: grantableScopes })
  @IsIn(grantableScopes)
  scopeType!: GrantableDataScope;

  /** 可选的临时授权过期时间。 */
  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
