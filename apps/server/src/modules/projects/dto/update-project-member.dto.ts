/**
 * 本文件定义项目成员角色变更的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateProjectMemberRequestPayload } from '@workspace/contracts/projects';
import { IsIn } from 'class-validator';

/** 可以通过成员接口设置的非负责人角色。 */
const mutableProjectRoles = ['MANAGER', 'MEMBER', 'VIEWER'] as const;

/** 校验项目成员角色变更请求。 */
export class UpdateProjectMemberDto implements UpdateProjectMemberRequestPayload {
  /** 更新后的项目成员角色。 */
  @ApiProperty({ enum: mutableProjectRoles, example: 'MANAGER' })
  @IsIn(mutableProjectRoles)
  role!: UpdateProjectMemberRequestPayload['role'];
}
