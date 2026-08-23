/**
 * 本文件提供 2.4 阶段最小 AI Thread 创建、消息提交与事件补拉接口。
 */

import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  CreateAiThreadMessageRunDto,
  CreateAiThreadRunDto,
} from '../dto/ai-request.dto';
import { ListAiThreadsDto } from '../dto/list-ai-threads.dto';
import { AiRuntimeQueryService } from '../services/ai-runtime-query.service';
import { AiThreadHistoryQueryService } from '../services/ai-thread-history-query.service';
import { AiThreadService } from '../services/ai-thread.service';

@ApiTags('ai-threads')
@ApiBearerAuth()
@Controller('ai/threads')
export class AiThreadController {
  /** 注入 Thread 状态服务和事件查询服务。 */
  constructor(
    private readonly aiThreadService: AiThreadService,
    private readonly aiThreadHistoryQueryService: AiThreadHistoryQueryService,
    private readonly aiRuntimeQueryService: AiRuntimeQueryService,
  ) {}

  /** 返回当前用户仍有 Decision 访问权的 AI Thread 历史页。 */
  @Get()
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '分页查询当前用户的 AI Thread 历史' })
  listThreads(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListAiThreadsDto,
  ) {
    return this.aiThreadHistoryQueryService.listThreads(authorization, query);
  }

  /** 原子创建 Thread、首条用户消息和排队 Run。 */
  @Post()
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '创建绑定决策的 AI Thread 与首个 Run' })
  createInitialRun(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateAiThreadRunDto,
  ) {
    return this.aiThreadService.createInitialRun({
      authorization,
      decisionId: body.decisionId,
      content: body.content,
      clientRequestId: body.clientRequestId,
      modelRole: body.modelRole ?? 'standard',
    });
  }

  /** 在既有 Thread 中原子创建用户消息和排队 Run。 */
  @Post(':threadId/messages')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '在 AI Thread 中提交新消息并创建 Run' })
  createMessageRun(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: CreateAiThreadMessageRunDto,
  ) {
    return this.aiThreadService.createMessageRun({
      authorization,
      threadId,
      content: body.content,
      clientRequestId: body.clientRequestId,
      modelRole: body.modelRole ?? 'standard',
    });
  }

  /** 仅补拉已经持久化的事件，不领取或启动指定 Run。 */
  @Get(':threadId/stream')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '按序补拉 AI Run 持久化事件' })
  getRunEvents(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Query('runId') runId: string,
    @Query('afterSequence', new DefaultValuePipe(0), ParseIntPipe)
    afterSequence: number,
  ) {
    return this.aiRuntimeQueryService.getRunEvents(
      authorization,
      threadId,
      runId,
      Math.max(afterSequence, 0),
    );
  }
}
