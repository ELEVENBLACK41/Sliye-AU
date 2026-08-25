/**
 * 本文件暴露浏览器侧 AI 会话的创建与消息提交接口。
 * Thread 只归属于创建用户，不接收也不保存任何业务目标；
 * 业务对象由 Agent 从用户消息中发现，并在工具调用时由 NestJS 实时鉴权。
 */

import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  CreateAiThreadDto,
  CreateAiThreadMessageDto,
  ListAiMessagesQueryDto,
  RenameAiThreadDto,
  SetAiThreadArchivedDto,
  ListAiThreadsQueryDto,
  SetAiThreadPinnedDto,
} from '../dto/ai-request.dto';
import { AiMessageQueryService } from '../services/ai-message-query.service';
import { AiThreadMetadataService } from '../services/ai-thread-metadata.service';
import { AiThreadPinService } from '../services/ai-thread-pin.service';
import { AiThreadQueryService } from '../services/ai-thread-query.service';
import { AiThreadService } from '../services/ai-thread.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/threads')
export class AiThreadController {
  /** 注入 AI 会话持久化与只读查询服务。 */
  constructor(
    private readonly threadService: AiThreadService,
    private readonly threadQueryService: AiThreadQueryService,
    private readonly threadPinService: AiThreadPinService,
    private readonly messageQueryService: AiMessageQueryService,
    private readonly threadMetadataService: AiThreadMetadataService,
  ) {}

  /** 按最后活动时间倒序分页返回当前用户的未固定会话。 */
  @Get()
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '分页查询 AI 会话列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListAiThreadsQueryDto,
  ) {
    return this.threadQueryService.listThreads(authorization.userId, {
      cursor: query.cursor,
      limit: query.limit,
      filter: query.filter,
    });
  }

  /**
   * 一次性返回当前用户的全部固定会话。
   * 该路由必须声明在 `:threadId` 之前，否则 `pinned` 会被当作 Thread 标识匹配。
   */
  @Get('pinned')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '查询固定的 AI 会话列表' })
  listPinned(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.threadPinService.listPinnedThreads(authorization.userId);
  }

  /** 固定或取消固定一个会话；重复设置为同一状态是幂等的。 */
  @Put(':threadId/pinned')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '固定或取消固定 AI 会话' })
  setPinned(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: SetAiThreadPinnedDto,
  ) {
    return this.threadPinService.setThreadPinned(
      authorization.userId,
      threadId,
      body.pinned,
    );
  }

  /** 按创建时间从新到旧分页读取会话消息，返回时为时间正序。 */
  @Get(':threadId/messages')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '分页查询 AI 会话消息历史' })
  listMessages(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Query() query: ListAiMessagesQueryDto,
  ) {
    return this.messageQueryService.listMessages(
      authorization.userId,
      threadId,
      { cursor: query.cursor, limit: query.limit },
    );
  }

  /** 重命名会话；不改变会话的最后活动时间与列表排序位置。 */
  @Put(':threadId/title')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '重命名 AI 会话' })
  rename(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: RenameAiThreadDto,
  ) {
    return this.threadMetadataService.renameThread(
      authorization.userId,
      threadId,
      body.title,
    );
  }

  /** 归档或恢复会话；归档要求没有活跃 Run，并会同时清除固定状态。 */
  @Put(':threadId/archived')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '归档或恢复 AI 会话' })
  setArchived(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: SetAiThreadArchivedDto,
  ) {
    return this.threadMetadataService.setThreadArchived(
      authorization.userId,
      threadId,
      body.archived,
    );
  }

  /** 读取单条会话详情与当前活跃 Run 快照；非所有者统一返回不存在。 */
  @Get(':threadId')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '查询 AI 会话详情' })
  detail(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
  ) {
    return this.threadQueryService.getThreadDetail(
      authorization.userId,
      threadId,
    );
  }

  /** 原子创建 Thread、首条用户消息和首个排队 Run。 */
  @Post()
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '创建 AI 会话并排队首个运行' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateAiThreadDto,
  ) {
    return this.threadService.createThreadWithInitialRun({
      ownerUserId: authorization.userId,
      message: body.message,
      idempotencyKey: body.idempotencyKey,
      modelRole: 'standard',
    });
  }

  /**
   * 在既有 Thread 中提交用户消息。
   * 活跃 Run 期间普通消息只持久化排队；调整方向会替代尚未领取的旧输入并请求取消当前 Run。
   */
  @Post(':threadId/messages')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '在既有 AI 会话中提交用户消息' })
  createMessage(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('threadId') threadId: string,
    @Body() body: CreateAiThreadMessageDto,
  ) {
    return this.threadService.createMessageWithRun({
      ownerUserId: authorization.userId,
      threadId,
      message: body.message,
      idempotencyKey: body.idempotencyKey,
      modelRole: 'standard',
      submissionMode: body.submissionMode,
    });
  }
}
