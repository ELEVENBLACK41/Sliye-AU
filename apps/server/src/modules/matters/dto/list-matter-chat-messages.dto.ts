/**
 * 本文件定义分区聊天消息游标分页查询的运行时校验 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  MatterChatMessageListQuery,
  MatterChatPageDirection,
} from '@workspace/contracts/matters';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 校验分区消息历史、会议筛选和决策筛选参数。 */
export class ListMatterChatMessagesDto implements MatterChatMessageListQuery {
  /** 相对游标加载消息的方向。 */
  @ApiPropertyOptional({ enum: ['before', 'after'], default: 'before' })
  @IsOptional()
  @IsIn(['before', 'after'])
  direction?: MatterChatPageDirection;

  /** 消息数据库主键游标。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  /** 单页消息数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** 可选的会议筛选条件。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  meetingId?: number;

  /** 可选的决策筛选条件。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  decisionId?: number;
}
