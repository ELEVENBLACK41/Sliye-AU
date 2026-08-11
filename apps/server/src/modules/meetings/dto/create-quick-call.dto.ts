/**
 * 本文件定义发起独立或项目关联快速通话的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateQuickCallRequestPayload } from '@workspace/contracts/meetings';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验快速通话的参与人、媒体模式和可选业务上下文。 */
export class CreateQuickCallDto implements CreateQuickCallRequestPayload {
  /** 可选会议标题；空值由服务端按发起人生成。 */
  @ApiPropertyOptional({ example: '产品方案快速对齐' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  /** 快速通话初始媒体模式。 */
  @ApiProperty({ enum: ['AUDIO', 'VIDEO'] })
  @IsIn(['AUDIO', 'VIDEO'])
  mediaMode!: CreateQuickCallRequestPayload['mediaMode'];

  /** 一至五十名受邀用户。 */
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  participantIds!: number[];

  /** 可选项目分区主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  areaId?: number;

  /** 可选关联决策主键。 */
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  decisionIds!: number[];
}
