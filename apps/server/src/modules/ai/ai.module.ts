/**
 * 本文件注册 AI 状态持久化、事件和模型 Step 审计服务。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiEventService } from './services/ai-event.service';
import { AiRunLeaseService } from './services/ai-run-lease.service';
import { AiRunReconciliationService } from './services/ai-run-reconciliation.service';
import { AiRunService } from './services/ai-run.service';
import { AiStepService } from './services/ai-step.service';
import { AiThreadService } from './services/ai-thread.service';

@Module({
  imports: [AuthModule],
  providers: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
  ],
  exports: [
    AiThreadService,
    AiRunLeaseService,
    AiRunService,
    AiRunReconciliationService,
    AiEventService,
    AiStepService,
  ],
})
/** AI 状态模块，暂不注册第 2.5 才会开放的 HTTP Controller。 */
export class AiModule {}
