/**
 * 本文件定义当前登录用户修改个人资料时使用的 DTO。
 */
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateProfileRequestPayload } from '@workspace/contracts/auth';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 校验并规范化当前用户可以自行修改的个人资料字段。 */
export class UpdateProfileDto implements UpdateProfileRequestPayload {
  /** 用户显示名称，保存前去除首尾空白。 */
  @ApiProperty({ example: '张三', minLength: 1, maxLength: 40 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}
