/**
 * 本文件承载内部 Agent Runtime 执行接口的运行时校验规则。
 * 这些 DTO 只描述 Runtime 与 NestJS 之间的内部契约，浏览器不得调用对应接口；
 * 用户身份、业务范围和工具权限一律由服务端从持久化 Run 现取现算，不在这里传入。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AiRunFailureReason,
  AiRuntimeProviderWebSearchSettleInput,
  AiRuntimeProviderWebSearchStartInput,
} from '@workspace/contracts/ai';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 执行租约标识允许的最大长度。 */
const MAX_LEASE_ID_LENGTH = 128;

/** 单条文本增量允许的最大长度，避免一次写入超大事件负载。 */
const MAX_TEXT_DELTA_LENGTH = 8_000;

/** 单个持久化事件最多关联的即时模型增量数量。 */
const MAX_LIVE_DELTA_IDS_PER_EVENT = 256;

/** 助手最终正文允许的最大长度。 */
const MAX_ASSISTANT_CONTENT_LENGTH = 40_000;

/** 单个模型步骤允许关联的最大工具调用数量。 */
const MAX_TOOL_CALLS_PER_STEP = 20;

/** 全部内部执行接口共用的租约凭据。 */
export class AiRuntimeLeaseDto {
  /** 领取 Run 时签发、只有当前执行器持有的租约标识。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_LEASE_ID_LENGTH)
  executionLeaseId!: string;
}

/** 追加一条助手文本增量事件的内部请求。 */
export class AppendAiAssistantTextDto extends AiRuntimeLeaseDto {
  /** 增量所属的助手消息标识。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  messageId!: string;

  /** 需要追加的非空文本片段。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TEXT_DELTA_LENGTH)
  delta!: string;

  /** 本次持久化批次包含的即时增量稳定标识。 */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIVE_DELTA_IDS_PER_EVENT)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  liveDeltaIds?: string[];

  /** 本次持久化批次关联的第一个即时增量序号。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  liveSequenceStart?: number;

  /** 本次持久化批次关联的最后一个即时增量序号。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  liveSequenceEnd?: number;
}

/** 记录一次模型步骤的内部请求。 */
export class RecordAiStepDto extends AiRuntimeLeaseDto {
  /** Run 内从 1 开始且严格递增的模型步骤序号。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  /** Gateway 实际执行本步骤的供应商模型标识。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resolvedModelId?: string;

  /** 模型步骤结束原因。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  finishReason?: string;

  /** 本步骤输入 Token 数。 */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  /** 本步骤输出 Token 数。 */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  /** 本步骤 Token 总数。 */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalTokens?: number;

  /** 本步骤开始时间的 ISO 字符串。 */
  @ApiProperty()
  @IsISO8601()
  startedAt!: string;

  /** 本步骤结束时间的 ISO 字符串。 */
  @ApiProperty()
  @IsISO8601()
  finishedAt!: string;

  /** 本步骤内由模型生成的工具调用标识，用于关联审计记录。 */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_TOOL_CALLS_PER_STEP)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  providerToolCallIds!: string[];
}

/** 发起一次只读工具调用的内部请求。 */
export class InvokeAiToolDto extends AiRuntimeLeaseDto {
  /** 模型侧生成的工具调用标识，用于幂等与消息对齐。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  providerToolCallId!: string;

  /** 模型请求调用的工具名称；未注册名称由服务端拒绝。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  toolName!: string;

  /** 模型给出的工具输入对象，字段由对应工具自行校验。 */
  @ApiProperty({ type: Object })
  @IsObject()
  input!: Record<string, unknown>;
}

/** 开始记录一次 Gateway 网页检索的内部请求。 */
export class StartProviderWebSearchDto
  extends AiRuntimeLeaseDto
  implements AiRuntimeProviderWebSearchStartInput
{
  /** Gateway 生成的工具调用标识。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  providerToolCallId!: string;

  /** 模型提交给网页检索工具的输入。 */
  @ApiProperty({ type: Object })
  @IsObject()
  input!: Record<string, unknown>;
}

/** 完成一次 Gateway 网页检索的内部请求。 */
export class SettleProviderWebSearchDto
  extends StartProviderWebSearchDto
  implements AiRuntimeProviderWebSearchSettleInput
{
  /** Gateway 返回的网页检索结果。 */
  @ApiProperty({ type: Object })
  @IsObject()
  output!: Record<string, unknown>;

  /** 从工具调用到结果返回的耗时，单位为毫秒。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  durationMs!: number;
}

/** 一次 Run 聚合后的模型用量。 */
export class AiRunUsageDto {
  /** 累计输入 Token 数。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  inputTokens!: number;

  /** 累计输出 Token 数。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  outputTokens!: number;

  /** 输入与输出 Token 的累计总数。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  totalTokens!: number;

  /** 按运行当时价格快照估算的美元成本；无法估算时省略。 */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCostUsd?: number;
}

/** 把 Run 收敛为完成或失败终态的内部请求。 */
export class CompleteAiRunDto extends AiRuntimeLeaseDto {
  /** 目标终态；用户取消不走本接口。 */
  @ApiProperty({ enum: ['COMPLETED', 'FAILED'] })
  @IsIn(['COMPLETED', 'FAILED'])
  status!: 'COMPLETED' | 'FAILED';

  /** 失败路径的稳定原因；完成时省略。 */
  @ApiPropertyOptional({
    enum: [
      'MODEL_ERROR',
      'TOOL_ERROR',
      'EXECUTION_LEASE_EXPIRED',
      'INTERNAL_ERROR',
    ],
  })
  @IsOptional()
  @IsIn([
    'MODEL_ERROR',
    'TOOL_ERROR',
    'EXECUTION_LEASE_EXPIRED',
    'INTERNAL_ERROR',
  ])
  failureReason?: AiRunFailureReason;

  /** 失败路径的稳定业务错误码；完成时省略。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  failureCode?: string;

  /** 助手最终回答正文；模型未生成正文时省略。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ASSISTANT_CONTENT_LENGTH)
  assistantMessageContent?: string;

  /** Gateway 实际执行本次运行的供应商模型标识。 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resolvedModelId?: string;

  /** 本次运行聚合后的模型用量。 */
  @ApiPropertyOptional({ type: AiRunUsageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiRunUsageDto)
  usage?: AiRunUsageDto;
}
