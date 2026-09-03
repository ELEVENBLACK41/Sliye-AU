/**
 * 本文件注册 AI 持久化服务、权限策略、只读工具、内部执行链路与浏览器接口。
 *
 * 只读工具遵循统一分层：工具描述（descriptor）与执行器（tool service）按业务域
 * 拆分在 `tools/<domain>/` 下；执行器只做输入校验、权限上下文派生和输出映射，
 * 真实的业务查询委托给对应业务域模块（如 decisions），避免 ai 模块直接堆积
 * 各业务域的 Prisma 查询，随着工具数量增长失控。
 *
 * 新增一个工具只需要三步：在 `tools/<domain>/` 下补 descriptor 与执行器、
 * 把 descriptor 加入 `AI_TOOL_DESCRIPTOR_REGISTRATIONS`、把执行器加入
 * providers 与 `AI_TOOL_EXECUTORS` 工厂，编排层不需要任何改动。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DecisionsModule } from '../decisions/decisions.module';
import {
  AI_TOOL_DESCRIPTORS,
  AI_TOOL_EXECUTORS,
  type AiToolDescriptor,
} from './types/ai-tool-registry.types';
import type { AiToolExecutor } from './types/ai-tool-source.types';
import { AiPermissionPolicyService } from './policies/ai-permission-policy';
import { FIND_DECISION_CANDIDATES_DESCRIPTOR } from './tools/decision/find-decision-candidates.descriptor';
import { FindDecisionCandidatesToolService } from './tools/decision/find-decision-candidates.service';
import { GET_DECISION_CONTEXT_DESCRIPTOR } from './tools/decision/get-decision-context.descriptor';
import { GetDecisionContextToolService } from './tools/decision/get-decision-context.service';
import { AiRunController } from './controllers/ai-run.controller';
import { AiRuntimeController } from './controllers/ai-runtime.controller';
import { AiThreadController } from './controllers/ai-thread.controller';
import { AiRuntimeServiceGuard } from './guards/ai-runtime-service.guard';
import { AiAssistantMessageService } from './services/run/ai-assistant-message.service';
import { AiContextBudgetService } from './services/runtime/ai-context-budget.service';
import { AiEventService } from './services/run/ai-event.service';
import { AiExecutionLeaseService } from './services/run/ai-execution-lease.service';
import { AiRunQueryService } from './services/run/ai-run-query.service';
import { AiRuntimeExecutionService } from './services/runtime/ai-runtime-execution.service';
import { AiRuntimeSessionService } from './services/runtime/ai-runtime-session.service';
import { AiRunControlService } from './services/run/ai-run-control.service';
import { AiRunService } from './services/run/ai-run.service';
import { AiQueueService } from './services/run/ai-queue.service';
import { AiSourceDependencyService } from './services/source/ai-source-dependency.service';
import { AiStepService } from './services/run/ai-step.service';
import { AiMessageQueryService } from './services/thread/ai-message-query.service';
import { AiSourceVisibilityService } from './services/source/ai-source-visibility.service';
import { AiThreadMetadataService } from './services/thread/ai-thread-metadata.service';
import { AiThreadPinService } from './services/thread/ai-thread-pin.service';
import { AiThreadQueryService } from './services/thread/ai-thread-query.service';
import { AiThreadService } from './services/thread/ai-thread.service';
import { AiToolCallService } from './services/tool/ai-tool-call.service';
import { AiToolInvocationService } from './services/tool/ai-tool-invocation.service';
import { AiToolRegistryService } from './services/tool/ai-tool-registry.service';

/**
 * 当前批准注册的只读工具描述。
 * 第二阶段只开放“实体发现 + 决策上下文读取”这一条最小真实工具链。
 */
const AI_TOOL_DESCRIPTOR_REGISTRATIONS: readonly AiToolDescriptor[] = [
  FIND_DECISION_CANDIDATES_DESCRIPTOR,
  GET_DECISION_CONTEXT_DESCRIPTOR,
];

@Module({
  imports: [AuthModule, DecisionsModule],
  controllers: [AiThreadController, AiRunController, AiRuntimeController],
  providers: [
    {
      provide: AI_TOOL_DESCRIPTORS,
      useValue: AI_TOOL_DESCRIPTOR_REGISTRATIONS,
    },
    {
      provide: AI_TOOL_EXECUTORS,
      inject: [
        FindDecisionCandidatesToolService,
        GetDecisionContextToolService,
      ],
      /** 汇总全部已注册工具执行器，供编排层按稳定名称解析。 */
      useFactory: (
        findDecisionCandidates: FindDecisionCandidatesToolService,
        getDecisionContext: GetDecisionContextToolService,
      ): readonly AiToolExecutor<Record<string, unknown>, unknown>[] => [
        findDecisionCandidates,
        getDecisionContext,
      ],
    },
    AiRuntimeServiceGuard,
    AiPermissionPolicyService,
    FindDecisionCandidatesToolService,
    GetDecisionContextToolService,
    AiAssistantMessageService,
    AiContextBudgetService,
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRunQueryService,
    AiRuntimeExecutionService,
    AiRuntimeSessionService,
    AiRunControlService,
    AiRunService,
    AiSourceDependencyService,
    AiStepService,
    AiMessageQueryService,
    AiSourceVisibilityService,
    AiThreadMetadataService,
    AiThreadPinService,
    AiThreadQueryService,
    AiThreadService,
    AiToolCallService,
    AiToolInvocationService,
    AiToolRegistryService,
  ],
  exports: [
    AiPermissionPolicyService,
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRunQueryService,
    AiRuntimeExecutionService,
    AiRuntimeSessionService,
    AiRunControlService,
    AiRunService,
    AiMessageQueryService,
    AiSourceVisibilityService,
    AiThreadMetadataService,
    AiThreadPinService,
    AiThreadQueryService,
    AiThreadService,
    AiToolInvocationService,
    AiToolRegistryService,
  ],
})
export class AiModule {}
