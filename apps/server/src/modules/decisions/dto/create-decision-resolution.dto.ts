/*
 * @Description: 最终决议创建请求 DTO，校验可选来源提案、可选投票和正式结论正文。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDecisionResolutionRequestPayload } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验直接确认结论或采纳开放提案并形成最终决议的请求。 */
export class CreateDecisionResolutionDto implements CreateDecisionResolutionRequestPayload {
  /** 可选的来源提案主键；讨论已形成共识时可以不关联提案。 */
  @ApiPropertyOptional({ example: 50, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceProposalId?: number;

  /** 可选的已关闭来源投票轮次主键。 */
  @ApiPropertyOptional({ example: 70, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceVoteRoundId?: number;

  /** 正式决议标题。 */
  @ApiProperty({ example: '正式采用权限服务拆分方案' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  /** 正式决议正文和确认理由。 */
  @ApiProperty({
    example: '本轮决定先抽离权限计算服务，并在下一迭代完成调用方迁移。',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  content!: string;

  /** 可选的决议形成会议；服务端会校验会议属于当前决策且正在进行。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;
}
