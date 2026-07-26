/**
 * 本文件定义管理员审计读取私有协作内容的运行时校验 DTO。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MatterAuditReadRequestPayload } from '@workspace/contracts/matters';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 校验审计读取目标和访问原因。 */
export class MatterAuditReadDto implements MatterAuditReadRequestPayload {
  /** 目标议事主键。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  matterId!: number;

  /** 目标私有分区主键。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  areaId!: number;

  /** 可选的目标会议主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  meetingId?: number;

  /** 本次审计访问的明确原因。 */
  @ApiProperty({ example: '调查编号 SEC-2026-018 的权限泄露事件。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
