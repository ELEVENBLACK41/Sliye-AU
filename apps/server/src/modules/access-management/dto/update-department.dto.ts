/*
 * @Description: 更新部门基础资料 DTO，不允许修改稳定部门代码。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateDepartmentRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 更新部门名称与排序的运行时校验 DTO。 */
export class UpdateDepartmentDto implements UpdateDepartmentRequestPayload {
  /** 新的部门中文名称。 */
  @ApiPropertyOptional({ example: '产品与设计中心' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** 新的同级排序值。 */
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
