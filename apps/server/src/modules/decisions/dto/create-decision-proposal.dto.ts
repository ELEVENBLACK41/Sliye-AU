/*
 * @Description: 决策提案创建请求 DTO，校验提案标题和补充说明。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDecisionProposalRequestPayload } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验在现有决策中创建开放提案的请求。 */
export class CreateDecisionProposalDto implements CreateDecisionProposalRequestPayload {
  /** 提案标题。 */
  @ApiProperty({ example: '先抽离权限计算服务' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 提案的背景、方案或补充说明。 */
  @ApiPropertyOptional({ example: '先稳定权限边界，再逐步迁移现有调用方。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** 可选的提案形成会议；服务端会校验会议属于当前决策且正在进行。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;
}
