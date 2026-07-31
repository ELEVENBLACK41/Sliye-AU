/**
 * 本文件定义项目生命周期变更的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateProjectStatusRequestPayload } from '@workspace/contracts/projects';
import { IsIn } from 'class-validator';

/** 项目允许进入的稳定状态集合。 */
const projectStatuses = ['ACTIVE', 'CLOSED', 'ARCHIVED'] as const;

/** 校验项目生命周期目标状态。 */
export class UpdateProjectStatusDto implements UpdateProjectStatusRequestPayload {
  /** 项目目标状态。 */
  @ApiProperty({ enum: projectStatuses, example: 'CLOSED' })
  @IsIn(projectStatuses)
  status!: UpdateProjectStatusRequestPayload['status'];
}
