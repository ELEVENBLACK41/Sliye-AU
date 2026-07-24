/**
 * 本文件定义发送决策群聊文字消息的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDecisionChatMessageRequest } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验浏览器提交的文字消息、幂等标识和可选回复目标。 */
export class CreateDecisionChatMessageDto implements CreateDecisionChatMessageRequest {
  /** 浏览器为本次发送生成并在失败重试时复用的 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientMessageId!: string;

  /** 去除首尾空白后长度为 1 至 2000 的消息正文。 */
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** 可选的同一决策群组一级回复目标消息主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  replyToId?: number;

  /** 可选的来源会议；服务端会校验会议属于当前决策且正在进行。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;
}
