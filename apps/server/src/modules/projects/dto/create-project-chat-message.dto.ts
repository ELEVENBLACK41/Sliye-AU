/**
 * 本文件定义发送分区聊天文字消息的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateProjectChatMessageRequestPayload } from '@workspace/contracts/projects';
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

/** 校验分区文字消息、幂等键和可选业务关联。 */
export class CreateProjectChatMessageDto implements CreateProjectChatMessageRequestPayload {
  /** 浏览器生成并在重试时复用的 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientMessageId!: string;

  /** 去除首尾空白后的消息正文。 */
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** 可选的同分区一级回复目标。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  replyToId?: number;

  /** 可选的来源会议主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;

  /** 可选的同项目关联决策主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  decisionId?: number;
}
