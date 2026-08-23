/**
 * 本文件定义 AI Thread 标题与归档状态白名单更新的运行时校验。
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateAiThreadRequest } from '@workspace/contracts/ai';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** trim 用户提交的标题，同时让非字符串值继续交给校验器拒绝。 */
function trimThreadTitle({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 校验第一版 Thread 重命名、归档和恢复请求。 */
export class UpdateAiThreadDto implements UpdateAiThreadRequest {
  /** trim 后 1～60 个 Unicode 字符的会话标题。 */
  @ApiPropertyOptional({ minLength: 1, maxLength: 60 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimThreadTitle)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title?: string;

  /** `true` 归档、`false` 恢复归档。 */
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  archived?: boolean;
}
