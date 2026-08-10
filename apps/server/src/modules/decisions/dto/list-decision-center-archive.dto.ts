/**
 * 本文件定义决策中心跨项目档案分页与筛选参数的运行时校验。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  DecisionCenterArchiveQuery,
  DecisionScope,
  DecisionStatus,
} from '@workspace/contracts/decisions';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 校验档案搜索、范围、状态与页码参数。 */
export class ListDecisionCenterArchiveDto implements DecisionCenterArchiveQuery {
  /** 去除首尾空白后的档案搜索词。 */
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @MaxLength(80)
  keyword?: string;

  /** 项目级或小组级协作范围。 */
  @ApiPropertyOptional({ enum: ['PROJECT', 'AREA'] })
  @IsOptional()
  @IsIn(['PROJECT', 'AREA'])
  scope?: DecisionScope;

  /** 决策业务状态。 */
  @ApiPropertyOptional({
    enum: ['DRAFT', 'DISCUSSING', 'RESOLVED', 'CANCELLED', 'ARCHIVED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'DISCUSSING', 'RESOLVED', 'CANCELLED', 'ARCHIVED'])
  status?: DecisionStatus;

  /** 当前页码。 */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 单页档案数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
