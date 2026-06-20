/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 创建权限请求 DTO，校验权限码、模块和动作
 * @Copyright: Copyright 1990 - 2026
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreatePermissionRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePermissionDto implements CreatePermissionRequestPayload {
  @ApiProperty({ example: 'decision:create' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/)
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ example: '创建决策' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiProperty({ example: 'decision' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  module!: string;

  @ApiProperty({ example: 'create' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  action!: string;

  @ApiPropertyOptional({ example: '允许创建新的决策记录' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desc?: string;
}
