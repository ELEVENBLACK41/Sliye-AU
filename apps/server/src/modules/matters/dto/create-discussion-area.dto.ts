/**
 * 本文件定义创建私有讨论分区的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDiscussionAreaRequestPayload } from '@workspace/contracts/matters';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验创建私有讨论分区所需的资料和初始成员。 */
export class CreateDiscussionAreaDto implements CreateDiscussionAreaRequestPayload {
  /** 私有分区名称。 */
  @ApiProperty({ example: '后端实现组' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** 私有分区用途说明。 */
  @ApiPropertyOptional({ example: '后端成员内部同步实现进度。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 初始分区成员主键。 */
  @ApiPropertyOptional({ type: [Number], example: [3, 5] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  memberIds?: number[];
}
