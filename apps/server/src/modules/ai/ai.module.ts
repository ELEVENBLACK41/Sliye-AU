/**
 * 本文件注册 AI 状态持久化、事件和模型 Step 审计服务。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiRunController } from './controllers/ai-run.controller';
import { AiRunScopeController } from './controllers/ai-run-scope.controller';
import { AiRuntimeToolController } from './controllers/ai-runtime-tool.controller';
import { AiThreadController } from './controllers/ai-thread.controller';
import { AiRuntimeServiceGuard } from './guards/ai-runtime-service.guard';
import { AiEventService } from './services/ai-event.service';
import { AiRunLeaseService } from './services/ai-run-lease.service';
import { AiRunReconciliationService } from './services/ai-run-reconciliation.service';
import { AiRunService } from './services/ai-run.service';
import { AiRunScopeService } from './services/ai-run-scope.service';
import { AiRuntimeQueryService } from './services/ai-runtime-query.service';
import { AiStepService } from './services/ai-step.service';
import { AiThreadHistoryQueryService } from './services/ai-thread-history-query.service';
import { AiThreadScopeService } from './services/ai-thread-scope.service';
import { AiThreadService } from './services/ai-thread.service';
import { AiToolCallService } from './services/ai-tool-call.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AiThreadController,
    AiRunController,
    AiRunScopeController,
    AiRuntimeToolController,
  ],
  providers: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunScopeService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
    AiThreadHistoryQueryService,
    AiThreadScopeService,
    AiRuntimeQueryService,
    AiRuntimeServiceGuard,
    AiToolCallService,
  ],
  exports: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunScopeService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
    AiThreadHistoryQueryService,
    AiThreadScopeService,
    AiRuntimeQueryService,
    AiToolCallService,
  ],
})
/** AI 状态模块，注册运行闭环与 2.5 历史管理查询能力。 */
export class AiModule {}
