/**
 * 本文件定义从私有分区发布公共摘要的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateDiscussionPublicationRequestPayload } from '@workspace/contracts/matters';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验私有区公开摘要及其来源消息引用。 */
export class CreateDiscussionPublicationDto implements CreateDiscussionPublicationRequestPayload {
  /** 公开摘要标题。 */
  @ApiProperty({ example: '后端组方案结论' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  /** 发布到公共区的摘要正文。 */
  @ApiProperty({ example: '后端组建议采用议事分区模型，并分阶段迁移。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(3000)
  summary!: string;

  /** 被摘要引用的私有原始消息主键。 */
  @ApiProperty({ type: [Number], example: [101, 102] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  sourceMessageIds!: number[];

  /** 可选的同议事关联决策主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  decisionId?: number;
}
