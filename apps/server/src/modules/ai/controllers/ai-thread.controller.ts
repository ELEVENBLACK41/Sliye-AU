/**
 * 本文件提供 AI Thread 创建、历史恢复、白名单更新、消息提交与事件补拉接口。
 */

import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { ListAiThreadMessagesDto } from '../dto/list-ai-thread-messages.dto';
import { ListAiThreadsDto } from '../dto/list-ai-threads.dto';
import { UpdateAiThreadDto } from '../dto/update-ai-thread.dto';
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

  /** 返回当前用户拥有且仍可访问的 AI Thread 安全详情。 */
  @Get(':threadId')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '查询 AI Thread 安全详情' })
  getThreadDetail(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
  ) {
    return this.aiThreadHistoryQueryService.getThreadDetail(
      authorization,
      threadId,
    );
  }

  /** 分页返回消息、对应 Run、工具调用和稳定来源关联。 */
  @Get(':threadId/messages')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '分页查询 AI Thread 消息历史' })
  listThreadMessages(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Query() query: ListAiThreadMessagesDto,
  ) {
    return this.aiThreadHistoryQueryService.listThreadMessages(
      authorization,
      threadId,
      query,
    );
  }

  /** 只允许当前 owner 重命名、归档或恢复 AI Thread。 */
  @Patch(':threadId')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '更新 AI Thread 标题或归档状态' })
  updateThread(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: UpdateAiThreadDto,
  ) {
    return this.aiThreadHistoryQueryService.updateThread(
      authorization,
      threadId,
      body,
    );
  }

  /** 原子创建不强制绑定业务数据的 Thread、首条用户消息和排队 Run。 */
  @Post()
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '创建 AI Thread 与首个待解析或精确范围 Run' })
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
