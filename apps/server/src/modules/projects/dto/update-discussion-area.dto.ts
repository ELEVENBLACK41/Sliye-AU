/**
 * 本文件定义私有讨论分区资料和状态更新的运行时校验 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateDiscussionAreaRequestPayload } from '@workspace/contracts/projects';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 允许管理接口设置的分区状态。 */
const mutableAreaStatuses = ['ACTIVE', 'READ_ONLY', 'ARCHIVED'] as const;

/** 校验私有讨论分区更新请求。 */
export class UpdateDiscussionAreaDto implements UpdateDiscussionAreaRequestPayload {
  /** 修改后的分区名称。 */
  @ApiPropertyOptional({ example: '后端协作组' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** 修改后的分区用途说明。 */
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  /** 修改后的分区状态。 */
  @ApiPropertyOptional({ enum: mutableAreaStatuses })
  @IsOptional()
  @IsIn(mutableAreaStatuses)
  status?: UpdateDiscussionAreaRequestPayload['status'];
}
