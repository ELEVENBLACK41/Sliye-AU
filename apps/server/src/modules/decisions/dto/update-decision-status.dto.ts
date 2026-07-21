/*
 * @Description: 决策开始讨论请求 DTO，当前阶段只允许从草稿进入讨论中。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateDecisionStatusRequestPayload } from '@workspace/contracts/decisions';
import { IsIn } from 'class-validator';

/** 当前小阶段允许进入的决策状态。 */
const allowedDecisionStatuses = ['DISCUSSING'] as const;

/** 校验决策开始讨论请求。 */
export class UpdateDecisionStatusDto implements UpdateDecisionStatusRequestPayload {
  /** 目标状态，当前仅允许传入 `DISCUSSING`。 */
  @ApiProperty({ enum: allowedDecisionStatuses, example: 'DISCUSSING' })
  @IsIn(allowedDecisionStatuses)
  status!: (typeof allowedDecisionStatuses)[number];
}
