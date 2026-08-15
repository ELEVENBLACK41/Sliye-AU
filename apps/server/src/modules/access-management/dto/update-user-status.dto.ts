/*
 * @Description: 管理员更新用户账号状态 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateAccessUserStatusRequestPayload } from '@workspace/contracts/access';
import { IsIn } from 'class-validator';

/** 管理员可设置的用户状态。 */
const manageableUserStatuses = ['ACTIVE', 'DISABLED', 'LOCKED'] as const;

/** 更新用户状态的运行时校验 DTO。 */
export class UpdateUserStatusDto implements UpdateAccessUserStatusRequestPayload {
  /** 目标用户状态。 */
  @ApiProperty({ enum: manageableUserStatuses, example: 'ACTIVE' })
  @IsIn(manageableUserStatuses)
  status!: (typeof manageableUserStatuses)[number];
}
