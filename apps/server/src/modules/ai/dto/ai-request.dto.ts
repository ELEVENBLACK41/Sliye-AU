/**
 * 本文件承载浏览器侧 AI 会话请求的运行时校验规则。
 * 这里只校验请求形状，权限、幂等和状态规则仍由对应服务负责。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateAiThreadRequest,
  AiMessageSubmissionMode,
} from '@workspace/contracts/ai';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 用户消息允许的最大长度，避免单条输入撑破上下文预算与数据库行。 */
const MAX_AI_MESSAGE_LENGTH = 8_000;

/** 幂等键允许的最大长度。 */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** Thread 与 Run 标识（cuid）允许的最大长度。 */
const MAX_AI_RESOURCE_ID_LENGTH = 64;

/** 校验创建 AI 会话的首条消息与幂等键；Thread 不接收任何业务目标字段。 */
export class CreateAiThreadDto implements CreateAiThreadRequest {
  /** 创建 Thread 的首条非空用户消息。 */
  @ApiProperty({ example: '帮我看看“缓存方案评审”这项决策现在到哪一步了。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_AI_MESSAGE_LENGTH)
  message!: string;

  /** 当前用户创建请求范围内的幂等键。 */
  @ApiProperty({ example: '7f2b1f4e-6f2a-4f3f-9a1e-2f0d8a5b6c7d' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey!: string;
}

/** 校验在既有 Thread 中发送用户消息的请求。 */
export class CreateAiThreadMessageDto {
  /** 本次发送的非空用户消息。 */
  @ApiProperty({ example: '换个方向，先只看最近一次决议。' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_AI_MESSAGE_LENGTH)
  message!: string;

  /** Thread、用户和消息请求范围内的幂等键。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey!: string;

  /** 普通发送顺序排队；调整方向会替代尚未领取的旧输入并请求取消当前 Run。 */
  @ApiProperty({ enum: ['NORMAL', 'STEER'], required: false })
  @IsOptional()
  @IsIn(['NORMAL', 'STEER'])
  submissionMode?: AiMessageSubmissionMode;
}

/**
 * 校验按序号补拉 Run 事件的查询参数。
 *
 * `threadId` 必须显式给出：查询会把它和 `runId`、Thread 所有者一起作为条件，
 * 缺失时 Prisma 会把 `undefined` 当作“未提供”静默丢弃该条件，
 * 因此这里强制为非空字符串，不允许退化成只按 Run 标识补拉。
 */
export class ListAiRunEventsQueryDto {
  /** 订阅方声称的 Thread 标识，必须与 Run 的真实归属一致。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_AI_RESOURCE_ID_LENGTH)
  threadId!: string;

  /** 浏览器已经收到的最后一个事件序号；首次订阅从 0 开始。 */
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  afterSequence?: number;
}

/** 校验从已结束 Run 创建重试 Run 的请求。 */
export class RetryAiRunDto {
  /** 旧 Run、用户和重试请求范围内的幂等键。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey!: string;
}
