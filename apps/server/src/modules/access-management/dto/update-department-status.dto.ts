/*
 * @Description: 更新部门启停状态 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateDepartmentStatusRequestPayload } from '@workspace/contracts/access';
import { IsIn } from 'class-validator';

/** 部门启停状态候选值。 */
const departmentStatuses = ['ACTIVE', 'DISABLED'] as const;

/** 更新部门状态的运行时校验 DTO。 */
export class UpdateDepartmentStatusDto implements UpdateDepartmentStatusRequestPayload {
  /** 目标部门状态。 */
  @ApiProperty({ enum: departmentStatuses, example: 'ACTIVE' })
  @IsIn(departmentStatuses)
  status!: (typeof departmentStatuses)[number];
}
