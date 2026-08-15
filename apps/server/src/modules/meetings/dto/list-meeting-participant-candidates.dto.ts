/**
 * 本文件定义独立会议联系人候选分页查询 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { MeetingParticipantCandidatesQuery } from '@workspace/contracts/meetings';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 校验联系人关键词和分页参数。 */
export class ListMeetingParticipantCandidatesDto implements MeetingParticipantCandidatesQuery {
  /** 可选姓名、邮箱或部门关键词。 */
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  /** 页码。 */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 每页条数。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
