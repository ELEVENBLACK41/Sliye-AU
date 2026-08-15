/**
 * 本文件定义新增项目成员的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AddProjectMemberRequestPayload } from '@workspace/contracts/projects';
import { IsIn, IsInt, Min } from 'class-validator';

/** 可以通过成员接口分配的非负责人角色。 */
const addableProjectRoles = ['MANAGER', 'MEMBER', 'VIEWER'] as const;

/** 校验新增项目成员请求。 */
export class AddProjectMemberDto implements AddProjectMemberRequestPayload {
  /** 需要加入项目的用户主键。 */
  @ApiProperty({ example: 8, minimum: 1 })
  @IsInt()
  @Min(1)
  userId!: number;

  /** 新成员在项目中的角色。 */
  @ApiProperty({ enum: addableProjectRoles, example: 'MEMBER' })
  @IsIn(addableProjectRoles)
  role!: AddProjectMemberRequestPayload['role'];
}
