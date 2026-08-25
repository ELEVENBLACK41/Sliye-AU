/**
 * 本文件承载浏览器侧 AI 会话请求的运行时校验规则。
 * 这里只校验请求形状，权限、幂等和状态规则仍由对应服务负责。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreateAiThreadRequest,
  AiMessageSubmissionMode,
  AiThreadListFilter,
  RenameAiThreadRequest,
  SetAiThreadArchivedRequest,
  SetAiThreadPinnedRequest,
} from '@workspace/contracts/ai';
import {
  AI_MESSAGE_PAGE_DEFAULT_LIMIT,
  AI_THREAD_LIST_FILTERS,
  AI_THREAD_TITLE_MAX_LENGTH,
  AI_THREAD_PAGE_DEFAULT_LIMIT,
} from '@workspace/contracts/ai';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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

/** 不透明分页游标允许的最大长度，避免超长输入进入解码流程。 */
const MAX_AI_CURSOR_LENGTH = 512;

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

/** 校验固定或取消固定会话的请求体。 */
export class SetAiThreadPinnedDto implements SetAiThreadPinnedRequest {
  /** `true` 固定会话，`false` 取消固定；重复设置为同一状态是幂等的。 */
  @ApiProperty()
  @IsBoolean()
  pinned!: boolean;
}

/**
 * 校验 Thread 列表的游标查询参数。
 *
 * `cursor` 只做长度与类型校验，内容合法性由游标解码统一判断并返回稳定错误码；
 * `limit` 超出上限时由服务端收敛，不在这里直接拒绝，避免客户端因为默认值变化而失败。
 */
export class ListAiThreadsQueryDto {
  /** 上一页返回的不透明游标；首页省略。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_AI_CURSOR_LENGTH)
  cursor?: string;

  /** 单页条数，缺省与上限由 contracts 常量定义。 */
  @ApiPropertyOptional({ default: AI_THREAD_PAGE_DEFAULT_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  /** 归档筛选条件，缺省为 `ACTIVE`。 */
  @ApiPropertyOptional({ enum: AI_THREAD_LIST_FILTERS })
  @IsOptional()
  @IsIn(AI_THREAD_LIST_FILTERS)
  filter?: AiThreadListFilter;
}

/** 校验重命名会话的请求体。 */
export class RenameAiThreadDto implements RenameAiThreadRequest {
  /** 新标题，两端空白由服务端去除；去除后不得为空。 */
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(AI_THREAD_TITLE_MAX_LENGTH)
  title!: string;
}

/** 校验归档或恢复会话的请求体。 */
export class SetAiThreadArchivedDto implements SetAiThreadArchivedRequest {
  /** `true` 归档会话，`false` 恢复会话；重复设置为同一状态是幂等的。 */
  @ApiProperty()
  @IsBoolean()
  archived!: boolean;
}

/** 校验会话消息历史的游标查询参数。 */
export class ListAiMessagesQueryDto {
  /** 上一页返回的不透明游标；首次请求省略。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_AI_CURSOR_LENGTH)
  cursor?: string;

  /** 单页条数，缺省与上限由 contracts 常量定义。 */
  @ApiPropertyOptional({ default: AI_MESSAGE_PAGE_DEFAULT_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
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
