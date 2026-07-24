/**
 * 本文件定义创建无音视频会议的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateMeetingRequestPayload,
  MeetingMode as MeetingModeContract,
} from '@workspace/contracts/meetings';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MeetingMode } from '../../../generated/prisma';

/** 校验在一项决策中创建计划会议所需的字段。 */
export class CreateMeetingDto implements CreateMeetingRequestPayload {
  /** 会议标题。 */
  @ApiProperty({ example: '权限模块重构方案评审会' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 会议目标或补充说明。 */
  @ApiPropertyOptional({ example: '讨论候选方案并决定是否进入投票。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 会议预期使用的沟通模式，当前阶段仅用于业务展示。 */
  @ApiProperty({ enum: MeetingMode, example: MeetingMode.VIDEO })
  @IsEnum(MeetingMode)
  mode!: MeetingModeContract;

  /** 可选的计划开始时间。 */
  @ApiPropertyOptional({ example: '2026-07-25T06:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}
