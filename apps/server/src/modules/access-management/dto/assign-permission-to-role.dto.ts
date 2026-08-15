/*
 * @Description: 自定义角色绑定系统权限及数据范围 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
  AssignPermissionToRoleRequestPayload,
  GrantableDataScope,
} from '@workspace/contracts/access';
import { IsIn, IsInt, Min } from 'class-validator';

/** 本期允许授予的稳定数据范围。 */
const grantableScopes: GrantableDataScope[] = [
  'ALL',
  'OWN',
  'DEPT',
  'DEPT_AND_CHILD',
  'PARTICIPATED',
];

/** 角色绑定权限的运行时校验 DTO。 */
export class AssignPermissionToRoleDto implements AssignPermissionToRoleRequestPayload {
  /** 系统权限主键。 */
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  permissionId!: number;

  /** 角色获得该权限时的数据范围。 */
  @ApiProperty({ enum: grantableScopes, example: 'DEPT' })
  @IsIn(grantableScopes)
  scopeType!: GrantableDataScope;
}
