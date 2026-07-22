/*
 * @Description: 决策提案非采纳关闭请求 DTO，只允许负责人拒绝或取消开放提案。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { CloseDecisionProposalRequestPayload } from '@workspace/contracts/decisions';
import { IsIn } from 'class-validator';
import { ProposalStatus } from '../../../generated/prisma';

/** 允许通过普通提案关闭接口进入的稳定终态。 */
const closeableProposalStatuses = [
  ProposalStatus.REJECTED,
  ProposalStatus.CANCELLED,
] as const;

/** 校验负责人拒绝或取消开放提案的请求。 */
export class CloseDecisionProposalDto implements CloseDecisionProposalRequestPayload {
  /** 目标提案非采纳终态。 */
  @ApiProperty({
    enum: closeableProposalStatuses,
    example: ProposalStatus.REJECTED,
  })
  @IsIn(closeableProposalStatuses)
  status!: CloseDecisionProposalRequestPayload['status'];
}
