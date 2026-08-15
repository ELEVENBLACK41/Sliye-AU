/**
 * 本文件定义受邀人接听或拒绝快速通话的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { RespondMeetingCallRequestPayload } from '@workspace/contracts/meetings';
import { IsIn } from 'class-validator';

/** 校验快速通话响应动作。 */
export class RespondMeetingCallDto implements RespondMeetingCallRequestPayload {
  /** 接听或拒绝。 */
  @ApiProperty({ enum: ['ACCEPT', 'DECLINE'] })
  @IsIn(['ACCEPT', 'DECLINE'])
  response!: RespondMeetingCallRequestPayload['response'];
}
