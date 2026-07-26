/**
 * 本文件定义创建议事的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateMatterRequestPayload } from '@workspace/contracts/matters';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验创建议事所需的标题、说明和发起部门。 */
export class CreateMatterDto implements CreateMatterRequestPayload {
  /** 议事标题。 */
  @ApiProperty({ example: '权限模块改造议事' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 议事背景或目标说明。 */
  @ApiPropertyOptional({ example: '统一讨论权限模块的重构范围和正式决策。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** 发起部门主键。 */
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  departmentId!: number;
}
