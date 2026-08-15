/*
 * @Description: 为用户分配或清空主部门的请求 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AssignDepartmentToUserRequestPayload } from '@workspace/contracts/access';
import { IsInt, IsOptional, Min } from 'class-validator';

/** 用户主部门调动的运行时校验 DTO。 */
export class AssignDepartmentToUserDto implements AssignDepartmentToUserRequestPayload {
  /** 目标部门主键，null 表示移出当前部门。 */
  @ApiProperty({ example: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId!: number | null;
}
