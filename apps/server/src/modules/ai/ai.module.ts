/**
 * 本文件注册 AI 持久化服务、权限策略与只读工具执行器；
 * 控制器和完整模型执行链路仍由后续步骤单独接入。
 *
 * 只读工具遵循统一分层：工具描述（descriptor）与执行器（tool service）按业务域
 * 拆分在 `tools/<domain>/` 下；执行器只做输入校验、权限上下文派生和输出映射，
 * 真实的业务查询委托给对应业务域模块（如 decisions），避免 ai 模块直接堆积
 * 各业务域的 Prisma 查询，随着工具数量增长失控。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DecisionsModule } from '../decisions/decisions.module';
import {
  AI_TOOL_DESCRIPTORS,
  type AiToolDescriptor,
} from './types/ai-tool-registry.types';
import { AiPermissionPolicyService } from './policies/ai-permission-policy';
import { FIND_DECISION_CANDIDATES_DESCRIPTOR } from './tools/decision/find-decision-candidates.descriptor';
import { FindDecisionCandidatesToolService } from './tools/decision/find-decision-candidates.service';
import { AiEventService } from './services/ai-event.service';
import { AiExecutionLeaseService } from './services/ai-execution-lease.service';
import { AiRuntimeExecutionService } from './services/ai-runtime-execution.service';
import { AiRunControlService } from './services/ai-run-control.service';
import { AiRunService } from './services/ai-run.service';
import { AiQueueService } from './services/ai-queue.service';
import { AiThreadService } from './services/ai-thread.service';
import { AiToolRegistryService } from './services/ai-tool-registry.service';

/**
 * 当前批准注册的只读工具描述。
 * 每新增一个工具，只需在对应业务域的 `tools/<domain>/` 目录下补一份
 * descriptor + 执行器，并在这里把 descriptor 加入这个数组、执行器加入 providers。
 */
const AI_TOOL_DESCRIPTOR_REGISTRATIONS: readonly AiToolDescriptor[] = [
  FIND_DECISION_CANDIDATES_DESCRIPTOR,
];

@Module({
  imports: [AuthModule, DecisionsModule],
  providers: [
    {
      provide: AI_TOOL_DESCRIPTORS,
      useValue: AI_TOOL_DESCRIPTOR_REGISTRATIONS,
    },
    AiPermissionPolicyService,
    FindDecisionCandidatesToolService,
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRuntimeExecutionService,
    AiRunControlService,
    AiRunService,
    AiThreadService,
    AiToolRegistryService,
  ],
  exports: [
    AiPermissionPolicyService,
    FindDecisionCandidatesToolService,
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRuntimeExecutionService,
    AiRunControlService,
    AiRunService,
    AiThreadService,
    AiToolRegistryService,
  ],
})
export class AiModule {}
