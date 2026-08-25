/**
 * 本文件暴露浏览器侧 AI 会话的创建与消息提交接口。
 * Thread 只归属于创建用户，不接收也不保存任何业务目标；
 * 业务对象由 Agent 从用户消息中发现，并在工具调用时由 NestJS 实时鉴权。
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  CreateAiThreadDto,
  CreateAiThreadMessageDto,
  ListAiThreadsQueryDto,
} from '../dto/ai-request.dto';
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
