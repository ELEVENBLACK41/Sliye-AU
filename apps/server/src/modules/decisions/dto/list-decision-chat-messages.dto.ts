/**
 * 本文件定义决策群聊消息列表的游标分页查询 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  DecisionChatMessageListQuery,
  DecisionChatPageDirection,
} from '@workspace/contracts/decisions';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 校验群聊历史加载和断线补偿使用的查询参数。 */
export class ListDecisionChatMessagesDto implements DecisionChatMessageListQuery {
  /** 相对游标向前加载历史或向后补齐新消息。 */
  @ApiPropertyOptional({ enum: ['before', 'after'], default: 'before' })
  @IsOptional()
  @IsIn(['before', 'after'])
  direction?: DecisionChatPageDirection;

  /** 消息数据库主键游标；首次加载最新消息时省略。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  /** 单页消息数量，默认 30，最大 50。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
