/**
 * 本文件定义议事成员角色变更的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateMatterMemberRequestPayload } from '@workspace/contracts/matters';
import { IsIn } from 'class-validator';

/** 可以通过成员接口设置的非负责人角色。 */
const mutableMatterRoles = ['MANAGER', 'MEMBER', 'VIEWER'] as const;

/** 校验议事成员角色变更请求。 */
export class UpdateMatterMemberDto implements UpdateMatterMemberRequestPayload {
  /** 更新后的议事成员角色。 */
  @ApiProperty({ enum: mutableMatterRoles, example: 'MANAGER' })
  @IsIn(mutableMatterRoles)
  role!: UpdateMatterMemberRequestPayload['role'];
}
