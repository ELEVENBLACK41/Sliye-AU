/*
 * @Description: 更新自定义角色中文资料 DTO，稳定代码不可修改。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateRoleRequestPayload } from '@workspace/contracts/access';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 更新自定义角色的运行时校验 DTO。 */
export class UpdateRoleDto implements UpdateRoleRequestPayload {
  /** 新的角色中文显示名称。 */
  @ApiPropertyOptional({ example: '高级项目评审人' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  /** 新的角色用途说明。 */
  @ApiPropertyOptional({ example: '负责跨部门项目决策评审。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desc?: string | null;
}
