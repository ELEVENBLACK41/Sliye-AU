/**
 * 本文件定义会议中心周日程聚合查询的运行时校验。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  MeetingCenterOverviewQuery,
  MeetingParticipantRole,
} from '@workspace/contracts/meetings';
import { Type } from 'class-transformer';
import { IsISO8601, IsIn, IsInt, IsOptional, Min } from 'class-validator';

/** 校验会议中心周范围、项目和当前用户角色筛选。 */
export class ListMeetingCenterOverviewDto implements MeetingCenterOverviewQuery {
  /** 周范围开始时刻，包含该时刻。 */
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  from!: string;

  /** 周范围结束时刻，不包含该时刻。 */
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  to!: string;

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
}
