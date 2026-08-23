/**
 * 本文件定义 AI Thread 历史列表游标、归档范围和决策筛选的运行时校验。
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AiThreadArchiveState,
  ListAiThreadsQuery,
} from '@workspace/contracts/ai';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验第一版 AI Thread 历史列表查询参数。 */
export class ListAiThreadsDto implements ListAiThreadsQuery {
  /** 服务端生成的不透明分页游标。 */
  @ApiPropertyOptional({ minLength: 1, maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  cursor?: string;

  /** 查询未归档或已归档会话。 */
  @ApiPropertyOptional({ enum: ['active', 'archived'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'archived'])
  archiveState?: AiThreadArchiveState;

  /** 可选的单项决策筛选条件。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  decisionId?: number;

  /** 单页 Thread 数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
