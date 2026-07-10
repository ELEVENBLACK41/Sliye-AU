/*
 * @Description: 移动部门 DTO，允许移动到根级或另一个上级部门。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { MoveDepartmentRequestPayload } from '@workspace/contracts/access';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 移动部门的运行时校验 DTO。 */
export class MoveDepartmentDto implements MoveDepartmentRequestPayload {
  /** 新上级部门主键，null 表示移动到根级。 */
  @ApiProperty({ example: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId!: number | null;

  /** 移动后的同级排序值。 */
  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
