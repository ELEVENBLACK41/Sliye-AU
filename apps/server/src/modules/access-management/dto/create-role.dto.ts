/*
 * @Description: 创建自定义角色 DTO，稳定代码创建后不可修改。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CreateRoleRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 创建自定义角色的运行时校验 DTO。 */
export class CreateRoleDto implements CreateRoleRequestPayload {
  /** 角色稳定代码。 */
  @ApiProperty({ example: 'PROJECT_REVIEWER' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @MaxLength(50)
  code!: string;

  /** 角色中文显示名称。 */
  @ApiProperty({ example: '项目评审人' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  /** 角色用途说明。 */
  @ApiPropertyOptional({ example: '负责查看并评审指定范围内的决策。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desc?: string;
}
