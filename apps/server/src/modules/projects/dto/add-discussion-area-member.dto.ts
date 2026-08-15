/**
 * 本文件定义新增私有分区成员的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AddDiscussionAreaMemberRequestPayload } from '@workspace/contracts/projects';
import { IsIn, IsInt, Min } from 'class-validator';

/** 私有分区允许分配的成员角色。 */
const discussionAreaMemberRoles = ['MANAGER', 'MEMBER'] as const;

/** 校验新增私有分区成员请求。 */
export class AddDiscussionAreaMemberDto implements AddDiscussionAreaMemberRequestPayload {
  /** 需要加入私有分区的项目成员主键。 */
  @ApiProperty({ example: 8, minimum: 1 })
  @IsInt()
  @Min(1)
  userId!: number;

  /** 新成员在私有分区中的角色。 */
  @ApiProperty({ enum: discussionAreaMemberRoles, example: 'MEMBER' })
  @IsIn(discussionAreaMemberRoles)
  role!: AddDiscussionAreaMemberRequestPayload['role'];
}
