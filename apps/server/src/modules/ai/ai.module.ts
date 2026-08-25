/**
 * 本文件注册 AI 持久化服务；控制器和模型执行链路仍由后续步骤单独接入。
 */

import { Module } from '@nestjs/common';
import { AiEventService } from './services/ai-event.service';
import { AiExecutionLeaseService } from './services/ai-execution-lease.service';
import { AiRuntimeExecutionService } from './services/ai-runtime-execution.service';
import { AiRunControlService } from './services/ai-run-control.service';
import { AiRunService } from './services/ai-run.service';
import { AiQueueService } from './services/ai-queue.service';
import { AiThreadService } from './services/ai-thread.service';

@Module({
  providers: [
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRuntimeExecutionService,
    AiRunControlService,
    AiRunService,
    AiThreadService,
  ],
  exports: [
    AiExecutionLeaseService,
    AiEventService,
    AiQueueService,
    AiRuntimeExecutionService,
    AiRunControlService,
    AiRunService,
    AiThreadService,
  ],
})
export class AiModule {}
