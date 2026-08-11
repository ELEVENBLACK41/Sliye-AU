/**
 * 本文件定义会议中心历史记录搜索、筛选和分页参数的运行时校验。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  MeetingCenterRecordsQuery,
  MeetingCenterRecordStatus,
  MeetingParticipantRole,
} from '@workspace/contracts/meetings';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 校验会议中心历史记录查询条件。 */
export class ListMeetingCenterRecordsDto implements MeetingCenterRecordsQuery {
  /** 去除首尾空白后的搜索关键词。 */
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @MaxLength(80)
  keyword?: string;

  /** 可选的项目筛选主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectId?: number;

  /** 可选的当前用户会议角色筛选。 */
  @ApiPropertyOptional({ enum: ['HOST', 'CO_HOST', 'ATTENDEE'] })
  @IsOptional()
  @IsIn(['HOST', 'CO_HOST', 'ATTENDEE'])
  role?: MeetingParticipantRole;

  /** 可选的会议终态筛选。 */
  @ApiPropertyOptional({ enum: ['ENDED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ENDED', 'CANCELLED'])
  status?: MeetingCenterRecordStatus;

  /** 可选的记录时间范围开始时刻。 */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** 可选的记录时间范围结束时刻。 */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** 当前页码。 */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 单页记录数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
