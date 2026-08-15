/*
 * @Description: 创建部门 DTO，校验稳定代码、名称、上级部门和排序。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDepartmentRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 创建部门的运行时校验 DTO。 */
export class CreateDepartmentDto implements CreateDepartmentRequestPayload {
  /** 部门稳定代码。 */
  @ApiProperty({ example: 'product-center' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/)
  @MaxLength(50)
  code!: string;

  /** 部门中文名称。 */
  @ApiProperty({ example: '产品中心' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** 可选的上级部门主键。 */
  @ApiPropertyOptional({ example: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  /** 同级部门排序值。 */
  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
