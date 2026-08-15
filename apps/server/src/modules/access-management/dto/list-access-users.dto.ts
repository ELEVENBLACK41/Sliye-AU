/*
 * @Description: 组织与权限模块成员列表的筛选和分页 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AccessUserListQuery,
  AccessUserStatus,
} from '@workspace/contracts/access';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 查询成员列表时允许使用的账号状态。 */
const accessUserStatuses: AccessUserStatus[] = [
  'PENDING',
  'ACTIVE',
  'DISABLED',
  'LOCKED',
];

/** 校验成员列表筛选条件并约束分页上限。 */
export class ListAccessUsersDto implements AccessUserListQuery {
  /** 去除首尾空白后的姓名或邮箱关键词。 */
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @MaxLength(80)
  keyword?: string;

  /** 可选的账号状态筛选。 */
  @ApiPropertyOptional({ enum: accessUserStatuses })
  @IsOptional()
  @IsIn(accessUserStatuses)
  status?: AccessUserStatus;

  /** 可选的部门主键，服务端会自动包含全部下级部门。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  /** 是否只查询尚未分配主部门的成员。 */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): boolean | undefined => {
    if (value === undefined) return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  withoutDepartment?: boolean;

  /** 可选的已绑定角色主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId?: number;

  /** 从 1 开始的页码。 */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 每页成员数量，最大允许 100。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
