/**
 * 本文件注册 AI 持久化服务；控制器和模型执行链路仍由后续步骤单独接入。
 */

import { Module } from '@nestjs/common';
import {
  AI_TOOL_DESCRIPTORS,
  type AiToolDescriptor,
} from './types/ai-tool-registry.types';
import { AiEventService } from './services/ai-event.service';
import { AiExecutionLeaseService } from './services/ai-execution-lease.service';
import { AiRuntimeExecutionService } from './services/ai-runtime-execution.service';
import { AiRunControlService } from './services/ai-run-control.service';
import { AiRunService } from './services/ai-run.service';
import { AiQueueService } from './services/ai-queue.service';
import { AiThreadService } from './services/ai-thread.service';
import { AiToolRegistryService } from './services/ai-tool-registry.service';

/** 当前增量只建立注册表边界，具体只读工具在后续增量单独注册。 */
const AI_TOOL_DESCRIPTOR_REGISTRATIONS: readonly AiToolDescriptor[] = [];

@Module({
  providers: [
    {
      provide: AI_TOOL_DESCRIPTORS,
      useValue: AI_TOOL_DESCRIPTOR_REGISTRATIONS,
    },
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
