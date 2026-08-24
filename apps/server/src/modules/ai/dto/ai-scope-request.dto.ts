/**
 * 本文件承载 AI 授权决策发现、Run 范围解析和候选确认请求校验。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ConfirmAiRunScopeRequest,
  DiscoverAiRunScopeRequest,
  SearchAccessibleDecisionsRequest,
} from '@workspace/contracts/ai';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 去除候选查询文本首尾空白。 */
function trimScopeQuery({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 查询当前用户可访问决策候选的 DTO。 */
export class SearchAccessibleDecisionsDto implements SearchAccessibleDecisionsRequest {
  /** 用户问题或明确决策引用。 */
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimScopeQuery)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  /** 最多返回的候选数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** 为排队 Run 发现授权决策范围的 DTO。 */
export class DiscoverAiRunScopeDto implements DiscoverAiRunScopeRequest {
  /** 当前用户问题或明确决策引用。 */
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimScopeQuery)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;
}

/** 用户确认一组已展示决策候选的 DTO。 */
export class ConfirmAiRunScopeDto implements ConfirmAiRunScopeRequest {
  /** 需要在本次 Run 中读取和比较的一个或多个候选决策。 */
  @ApiProperty({ type: [Number], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  decisionIds!: number[];
}
