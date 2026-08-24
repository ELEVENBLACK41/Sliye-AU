/**
 * 本文件承载 AI Thread、Run 执行器和真实只读工具接口的运行时请求校验。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AppendAiTextDeltaRequest,
  ClaimAiRunExecutionRequest,
  CompleteAiRunExecutionRequest,
  ConfirmAiRunCancellationRequest,
  CreateAiThreadMessageRunRequest,
  CreateAiThreadRunRequest,
  FailAiRunExecutionRequest,
  RecordAiModelStepRequest,
  RenewAiRunExecutionRequest,
  RetryAiRunRequest,
  StartAiToolCallRequest,
  FinishAiToolCallRequest,
  GetDecisionContextToolInput,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 规范化用户提交的文本字段。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 创建首个 AI Thread 和 Run 的 DTO。 */
export class CreateAiThreadRunDto implements CreateAiThreadRunRequest {
  /** 2.6 兼容调用提供的精确决策主键；新流程允许省略。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  decisionId?: number;

  /** 用户提交的首条问题。 */
  @ApiProperty({ minLength: 1, maxLength: 20_000 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;

  /** 浏览器生成的请求幂等 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  /** 本次执行的逻辑模型角色。 */
  @ApiPropertyOptional({ enum: ['standard', 'deepReview'] })
  @IsOptional()
  @IsIn(['standard', 'deepReview'])
  modelRole?: 'standard' | 'deepReview';
}

/** 在既有 Thread 中创建消息和 Run 的 DTO。 */
export class CreateAiThreadMessageRunDto implements CreateAiThreadMessageRunRequest {
  /** 用户提交的新问题。 */
  @ApiProperty({ minLength: 1, maxLength: 20_000 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;

  /** 浏览器生成的请求幂等 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  /** 本次执行的逻辑模型角色。 */
  @ApiPropertyOptional({ enum: ['standard', 'deepReview'] })
  @IsOptional()
  @IsIn(['standard', 'deepReview'])
  modelRole?: 'standard' | 'deepReview';
}

/** 从失败或取消 Run 创建新 Run 的 DTO。 */
export class RetryAiRunDto implements RetryAiRunRequest {
  /** 浏览器生成的请求幂等 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;
}

/** 内部执行器领取 Run 的 DTO。 */
export class ClaimAiRunExecutionDto implements ClaimAiRunExecutionRequest {
  /** 执行器租约持续毫秒数。 */
  @ApiProperty({ minimum: 1_000, maximum: 300_000 })
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  leaseDurationMs!: number;
}

/** 内部执行器续租 Run 的 DTO。 */
export class RenewAiRunExecutionDto implements RenewAiRunExecutionRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** 本次续租持续毫秒数。 */
  @ApiProperty({ minimum: 1_000, maximum: 300_000 })
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  leaseDurationMs!: number;
}

/** 内部执行器追加文本增量的 DTO。 */
export class AppendAiTextDeltaDto implements AppendAiTextDeltaRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** 流式助手消息 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  messageId!: string;

  /** 本次非空文本增量。 */
  @ApiProperty({ minLength: 1, maxLength: 20_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  delta!: string;
}

/** 内部执行器保存模型 Step 的 DTO。 */
export class RecordAiModelStepDto implements RecordAiModelStepRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** Run 内从 1 开始的模型调用序号。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  /** 本次调用的逻辑模型角色。 */
  @ApiProperty({ enum: ['standard', 'deepReview'] })
  @IsIn(['standard', 'deepReview'])
  modelRole!: 'standard' | 'deepReview';

  /** Gateway 实际执行的模型 ID。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  resolvedModelId!: string;

  /** AI SDK 返回的提供商名称。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  /** 提供商响应 ID；未提供时为空。 */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  responseId!: string | null;

  /** 模型停止原因。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  finishReason!: string;

  /** 本次调用的输入 Token 数。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  inputTokens!: number;

  /** 本次调用的输出 Token 数。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  outputTokens!: number;

  /** 根据价格快照估算的美元成本。 */
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  estimatedCostUsd!: number;

  /** 模型调用开始时间。 */
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startedAt!: string;

  /** 模型调用结束时间。 */
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  finishedAt!: string;

  /** 首个输出耗时；无法取得时为空。 */
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeToFirstOutputMs!: number | null;
}

/** 内部执行器完成 Run 的 DTO。 */
export class CompleteAiRunExecutionDto implements CompleteAiRunExecutionRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** 流式阶段预先分配的助手消息 UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assistantMessageId!: string;

  /** 需要固化的助手完整正文。 */
  @ApiProperty({ minLength: 1, maxLength: 100_000 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  assistantContent!: string;

  /** Gateway 最终实际执行的模型 ID。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  resolvedModelId!: string;

  /** 助手最终回答实际引用的稳定来源 ID。 */
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  sourceIds!: string[];
}

/** 内部执行器写入失败终态的 DTO。 */
export class FailAiRunExecutionDto implements FailAiRunExecutionRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** 可稳定统计的失败原因。 */
  @ApiProperty({
    enum: [
      'MODEL_ERROR',
      'TOOL_ERROR',
      'EXECUTION_LEASE_EXPIRED',
      'INTERNAL_ERROR',
    ],
  })
  @IsIn([
    'MODEL_ERROR',
    'TOOL_ERROR',
    'EXECUTION_LEASE_EXPIRED',
    'INTERNAL_ERROR',
  ])
  failureReason!:
    | 'MODEL_ERROR'
    | 'TOOL_ERROR'
    | 'EXECUTION_LEASE_EXPIRED'
    | 'INTERNAL_ERROR';

  /** 供调用方稳定分支判断的业务错误码。 */
  @ApiProperty({ enum: Object.values(API_ERROR_CODES) })
  @IsIn(Object.values(API_ERROR_CODES))
  failureCode!: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
}

/** 内部执行器确认取消终态的 DTO。 */
export class ConfirmAiRunCancellationDto implements ConfirmAiRunCancellationRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;
}

/** getDecisionContext 工具经过全局白名单校验的嵌套输入 DTO。 */
export class GetDecisionContextToolInputDto implements GetDecisionContextToolInput {
  /** 必须属于当前 AI Run 已确认范围的决策主键。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  decisionId!: number;
}

/** 内部执行器在工具运行前创建审计记录的 DTO。 */
export class StartAiToolCallDto implements StartAiToolCallRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** AI SDK 生成的工具调用 ID。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  toolCallId!: string;

  /** Run 内从 1 开始的工具调用序号。 */
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  /** 当前幂等调用希望确认的等待或运行状态。 */
  @ApiProperty({ enum: ['WAITING', 'RUNNING'] })
  @IsIn(['WAITING', 'RUNNING'])
  status!: 'WAITING' | 'RUNNING';

  /** 当前唯一开放的真实工具。 */
  @ApiProperty({ enum: ['getDecisionContext'] })
  @IsIn(['getDecisionContext'])
  toolName!: 'getDecisionContext';

  /** 已经过 Zod 校验的安全工具输入。 */
  @ApiProperty({ type: GetDecisionContextToolInputDto })
  @ValidateNested()
  @Type(() => GetDecisionContextToolInputDto)
  input!: GetDecisionContextToolInputDto;
}

/** 内部执行器在工具结束后完成审计记录的 DTO。 */
export class FinishAiToolCallDto implements FinishAiToolCallRequest {
  /** 当前有效的 fencing UUID。 */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  executionLeaseId!: string;

  /** AI SDK 生成的工具调用 ID。 */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  toolCallId!: string;

  /** 成功时的受控结果摘要。 */
  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  resultSummary!: FinishAiToolCallRequest['resultSummary'];

  /** 失败时的稳定错误码。 */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  errorCode!: string | null;

  /** AI SDK 测得的完整工具执行耗时。 */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  durationMs!: number;
}
