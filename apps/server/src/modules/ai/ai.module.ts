/**
 * 本文件注册 AI 持久化服务；控制器和模型执行链路仍由后续步骤单独接入。
 */

import { Module } from '@nestjs/common';
import { AiEventService } from './services/ai-event.service';
import { AiRunService } from './services/ai-run.service';
import { AiQueueService } from './services/ai-queue.service';
import { AiThreadService } from './services/ai-thread.service';

@Module({
  providers: [AiEventService, AiQueueService, AiRunService, AiThreadService],
  exports: [AiEventService, AiQueueService, AiRunService, AiThreadService],
})
export class AiModule {}
