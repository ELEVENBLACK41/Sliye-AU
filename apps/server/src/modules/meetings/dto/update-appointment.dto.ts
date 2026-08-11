/**
 * 本文件定义主持人修改未开始预约会议的运行时校验 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateAppointmentRequestPayload } from '@workspace/contracts/meetings';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验预约会议允许修改的字段。 */
export class UpdateAppointmentDto implements UpdateAppointmentRequestPayload {
  /** 新会议标题。 */
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  /** 新会议说明。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 新计划开始时间。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;

  /** 新计划时长。 */
  @ApiPropertyOptional({ minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  scheduledDurationMinutes?: number;

  /** 新媒体模式。 */
  @ApiPropertyOptional({ enum: ['AUDIO', 'VIDEO'] })
  @IsOptional()
  @IsIn(['AUDIO', 'VIDEO'])
  mediaMode?: UpdateAppointmentRequestPayload['mediaMode'];
}
