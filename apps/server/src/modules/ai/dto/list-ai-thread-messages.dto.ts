/**
 * 本文件定义 AI Thread 消息历史游标与页大小的运行时校验。
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ListAiThreadMessagesQuery } from '@workspace/contracts/ai';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验第一版 AI Thread 消息历史分页参数。 */
export class ListAiThreadMessagesDto implements ListAiThreadMessagesQuery {
  /** 服务端生成的不透明消息分页游标。 */
  @ApiPropertyOptional({ minLength: 1, maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  cursor?: string;

  /** 单页消息数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
