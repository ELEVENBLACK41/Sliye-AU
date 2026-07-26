/**
 * 本文件定义议事生命周期变更的运行时校验 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateMatterStatusRequestPayload } from '@workspace/contracts/matters';
import { IsIn } from 'class-validator';

/** 议事允许进入的稳定状态集合。 */
const matterStatuses = ['ACTIVE', 'CLOSED', 'ARCHIVED'] as const;

/** 校验议事生命周期目标状态。 */
export class UpdateMatterStatusDto implements UpdateMatterStatusRequestPayload {
  /** 议事目标状态。 */
  @ApiProperty({ enum: matterStatuses, example: 'CLOSED' })
  @IsIn(matterStatuses)
  status!: UpdateMatterStatusRequestPayload['status'];
}
