/**
 * 本文件注册 AI 状态持久化、事件和模型 Step 审计服务。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiRunController } from './controllers/ai-run.controller';
import { AiRuntimeToolController } from './controllers/ai-runtime-tool.controller';
import { AiThreadController } from './controllers/ai-thread.controller';
import { AiRuntimeServiceGuard } from './guards/ai-runtime-service.guard';
import { AiEventService } from './services/ai-event.service';
import { AiRunLeaseService } from './services/ai-run-lease.service';
import { AiRunReconciliationService } from './services/ai-run-reconciliation.service';
import { AiRunService } from './services/ai-run.service';
import { AiRuntimeQueryService } from './services/ai-runtime-query.service';
import { AiStepService } from './services/ai-step.service';
import { AiThreadService } from './services/ai-thread.service';
import { AiToolCallService } from './services/ai-tool-call.service';

@Module({
  imports: [AuthModule],
  controllers: [AiThreadController, AiRunController, AiRuntimeToolController],
  providers: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
    AiRuntimeQueryService,
    AiRuntimeServiceGuard,
    AiToolCallService,
  ],
  exports: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
    AiRuntimeQueryService,
    AiToolCallService,
  ],
})
/** AI 状态模块，注册 2.4 最小运行闭环接口；历史管理接口仍留到 2.5。 */
export class AiModule {}
