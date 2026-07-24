/*
 * @Description: 决策投票轮次创建请求 DTO，校验提案、标题、匿名设置与法定人数。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDecisionVoteRoundRequestPayload } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验为开放提案创建并立即开启投票的请求。 */
export class CreateDecisionVoteRoundDto implements CreateDecisionVoteRoundRequestPayload {
  /** 本轮需要表决的开放提案主键。 */
  @ApiProperty({ example: 50, minimum: 1 })
  @IsInt()
  @Min(1)
  proposalId!: number;

  /** 自定义投票标题；省略时由服务端根据提案标题生成。 */
  @ApiPropertyOptional({ example: '是否采纳权限服务拆分方案' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  /** 投票规则或补充说明。 */
  @ApiPropertyOptional({ example: '请基于实施成本与长期维护性表决。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** 是否隐藏投票人与选项的对应关系。 */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  /** 达到有效投票所需的最少选票数。 */
  @ApiPropertyOptional({ example: 3, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quorumCount?: number;

  /** 可选的投票发起会议；服务端会校验会议属于当前决策且正在进行。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;
}
