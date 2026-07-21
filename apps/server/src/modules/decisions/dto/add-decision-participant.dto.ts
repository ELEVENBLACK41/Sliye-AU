/*
 * @Description: 决策新增参与者请求 DTO，校验目标用户和允许分配的参与身份。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AddDecisionParticipantRequestPayload } from '@workspace/contracts/decisions';
import { IsIn, IsInt, Min } from 'class-validator';

/** 新增参与者时允许直接分配的身份。 */
const addableParticipantRoles = ['VIEWER', 'EDITOR', 'APPROVER'] as const;

/** 校验向决策添加参与者的请求。 */
export class AddDecisionParticipantDto implements AddDecisionParticipantRequestPayload {
  /** 需要加入决策的用户主键。 */
  @ApiProperty({ example: 8, minimum: 1 })
  @IsInt()
  @Min(1)
  userId!: number;

  /** 参与者身份；负责人身份不能通过此接口分配。 */
  @ApiProperty({ enum: addableParticipantRoles, example: 'EDITOR' })
  @IsIn(addableParticipantRoles)
  role!: (typeof addableParticipantRoles)[number];
}
