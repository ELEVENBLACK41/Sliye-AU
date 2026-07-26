/*
 * @Description: 创建决策请求 DTO，校验标题、说明和目标部门。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDecisionRequestPayload } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 创建最小决策记录的运行时校验 DTO。 */
export class CreateDecisionDto implements CreateDecisionRequestPayload {
  /** 决策标题。 */
  @ApiProperty({ example: '是否重构权限模块' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 决策背景或补充说明。 */
  @ApiPropertyOptional({ example: '评估重构范围、风险和交付节奏。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 决策所属部门主键。 */
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  departmentId!: number;

  /** 可选的来源会议；服务端会校验会议属于当前议事且正在进行。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;
}
