/**
 * 本文件定义新增议事成员的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AddMatterMemberRequestPayload } from '@workspace/contracts/matters';
import { IsIn, IsInt, Min } from 'class-validator';

/** 可以通过成员接口分配的非负责人角色。 */
const addableMatterRoles = ['MANAGER', 'MEMBER', 'VIEWER'] as const;

/** 校验新增议事成员请求。 */
export class AddMatterMemberDto implements AddMatterMemberRequestPayload {
  /** 需要加入议事的用户主键。 */
  @ApiProperty({ example: 8, minimum: 1 })
  @IsInt()
  @Min(1)
  userId!: number;

  /** 新成员在议事中的角色。 */
  @ApiProperty({ enum: addableMatterRoles, example: 'MEMBER' })
  @IsIn(addableMatterRoles)
  role!: AddMatterMemberRequestPayload['role'];
}
