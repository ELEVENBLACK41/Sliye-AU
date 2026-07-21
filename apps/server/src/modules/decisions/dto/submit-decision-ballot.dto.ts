/*
 * @Description: 决策选票提交请求 DTO，校验单选选项和可选投票理由。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SubmitDecisionBallotRequestPayload } from '@workspace/contracts/decisions';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 校验当前参与者提交单选选票的请求。 */
export class SubmitDecisionBallotDto implements SubmitDecisionBallotRequestPayload {
  /** 当前用户选择的投票选项主键。 */
  @ApiProperty({ example: 101, minimum: 1 })
  @IsInt()
  @Min(1)
  optionId!: number;

  /** 当前用户对整张选票填写的可选理由。 */
  @ApiPropertyOptional({ example: '方案收益高于本轮实施成本。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
