/**
 * 本文件定义创建独立或项目关联预约会议的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateAppointmentRequestPayload } from '@workspace/contracts/meetings';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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

/** 校验预约会议的时间、参与人和可选上下文。 */
export class CreateAppointmentDto implements CreateAppointmentRequestPayload {
  /** 预约会议标题。 */
  @ApiProperty({ example: '季度方案评审会' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 会议说明。 */
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 计划开始时间。 */
  @ApiProperty({ example: '2026-08-12T02:00:00.000Z' })
  @IsISO8601({ strict: true })
  scheduledAt!: string;

  /** 计划时长。 */
  @ApiProperty({ minimum: 15, maximum: 480 })
  @IsInt()
  @Min(15)
  @Max(480)
  scheduledDurationMinutes!: number;

  /** 初始媒体模式。 */
  @ApiProperty({ enum: ['AUDIO', 'VIDEO'] })
  @IsIn(['AUDIO', 'VIDEO'])
  mediaMode!: CreateAppointmentRequestPayload['mediaMode'];

  /** 受邀用户主键。 */
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  participantIds!: number[];

  /** 可选项目分区。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  areaId?: number;

  /** 可选关联决策。 */
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  decisionIds!: number[];
}
