/**
 * 本文件提供议事、成员、分区、分区聊天、Ticket 和公开摘要的 HTTP 接口。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../auth/types/auth.types';
import { AddDiscussionAreaMemberDto } from './dto/add-discussion-area-member.dto';
import { AddMatterMemberDto } from './dto/add-matter-member.dto';
import { CreateDiscussionAreaDto } from './dto/create-discussion-area.dto';
import { CreateDiscussionPublicationDto } from './dto/create-discussion-publication.dto';
import { CreateMatterChatMessageDto } from './dto/create-matter-chat-message.dto';
import { CreateMatterDto } from './dto/create-matter.dto';
import { ListMatterChatMessagesDto } from './dto/list-matter-chat-messages.dto';
import { ListMatterMemberCandidatesDto } from './dto/list-matter-member-candidates.dto';
import { UpdateDiscussionAreaDto } from './dto/update-discussion-area.dto';
import { UpdateMatterMemberDto } from './dto/update-matter-member.dto';
import { UpdateMatterStatusDto } from './dto/update-matter-status.dto';
import { DiscussionAreaService } from './services/discussion-area.service';
import { MatterChatService } from './services/matter-chat.service';
import { MatterCoreService } from './services/matter-core.service';
import { MatterMemberService } from './services/matter-member.service';

@ApiTags('matters')
@ApiBearerAuth()
@Controller('matters')
export class MattersController {
  /** 注入议事各职责服务，控制器只负责路由和参数转发。 */
  constructor(
    private readonly coreService: MatterCoreService,
    private readonly memberService: MatterMemberService,
    private readonly areaService: DiscussionAreaService,
    private readonly chatService: MatterChatService,
  ) {}

  /** 查询当前用户作为成员加入的议事列表。 */
  @Get()
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询当前用户的议事列表' })
  list(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.coreService.list(authorization);
  }

  /** 创建议事、负责人关系和唯一公共讨论区。 */
  @Post()
  @RequirePermissions('matter:create')
  @ApiOperation({ summary: '创建议事空间' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateMatterDto,
  ) {
    return this.coreService.create(authorization, body);
  }

  /** 查询当前用户可见的议事详情。 */
  @Get(':matterId')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询议事详情' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
  ) {
    return this.coreService.get(authorization, matterId);
  }

  /** 关闭、重开或归档议事。 */
  @Patch(':matterId/status')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '更新议事生命周期' })
  updateStatus(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Body() body: UpdateMatterStatusDto,
  ) {
    return this.coreService.updateStatus(authorization, matterId, body);
  }

  /** 查询议事成员列表。 */
  @Get(':matterId/members')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询议事成员' })
  listMembers(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
  ) {
    return this.memberService.list(authorization, matterId);
  }

  /** 查询尚未加入当前议事的可用用户候选列表。 */
  @Get(':matterId/member-candidates')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '查询议事可加入成员候选' })
  listMemberCandidates(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Query() query: ListMatterMemberCandidatesDto,
  ) {
    return this.memberService.listCandidates(authorization, matterId, query);
  }

  /** 向议事添加成员。 */
  @Post(':matterId/members')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '添加议事成员' })
  addMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Body() body: AddMatterMemberDto,
  ) {
    return this.memberService.add(authorization, matterId, body);
  }

  /** 修改非负责人的议事成员角色。 */
  @Patch(':matterId/members/:userId')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '修改议事成员角色' })
  updateMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateMatterMemberDto,
  ) {
    return this.memberService.update(authorization, matterId, userId, body);
  }

  /** 移除议事成员并立即撤销实时访问。 */
  @Delete(':matterId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '移除议事成员' })
  removeMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.memberService.remove(authorization, matterId, userId);
  }

  /** 查询当前用户可见的公共区和私有分区。 */
  @Get(':matterId/areas')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询可见讨论分区' })
  listAreas(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
  ) {
    return this.areaService.list(authorization, matterId);
  }

  /** 创建私有讨论分区。 */
  @Post(':matterId/areas')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '创建私有讨论分区' })
  createArea(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Body() body: CreateDiscussionAreaDto,
  ) {
    return this.areaService.create(authorization, matterId, body);
  }

  /** 更新讨论分区资料或私有分区状态。 */
  @Patch(':matterId/areas/:areaId')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '更新讨论分区' })
  updateArea(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: UpdateDiscussionAreaDto,
  ) {
    return this.areaService.update(authorization, matterId, areaId, body);
  }

  /** 查询私有分区成员列表。 */
  @Get(':matterId/areas/:areaId/members')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询私有分区成员' })
  listAreaMembers(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
  ) {
    return this.areaService.listMembers(authorization, matterId, areaId);
  }

  /** 向私有分区添加议事成员。 */
  @Post(':matterId/areas/:areaId/members')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '添加私有分区成员' })
  addAreaMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: AddDiscussionAreaMemberDto,
  ) {
    return this.areaService.addMember(authorization, matterId, areaId, body);
  }

  /** 移除私有分区成员并立即撤销实时访问。 */
  @Delete(':matterId/areas/:areaId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '移除私有分区成员' })
  removeAreaMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.areaService.removeMember(
      authorization,
      matterId,
      areaId,
      userId,
    );
  }

  /** 查询当前分区消息，支持会议和决策筛选。 */
  @Get(':matterId/areas/:areaId/messages')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询分区聊天消息' })
  listMessages(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Query() query: ListMatterChatMessagesDto,
  ) {
    return this.chatService.list(authorization, matterId, areaId, query);
  }

  /** 发送一条分区文字消息。 */
  @Post(':matterId/areas/:areaId/messages')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '发送分区聊天消息' })
  createMessage(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: CreateMatterChatMessageDto,
  ) {
    return this.chatService.create(authorization, matterId, areaId, body);
  }

  /** 为当前会话签发只绑定当前分区的 Socket Ticket。 */
  @Post(':matterId/areas/:areaId/chat-ticket')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '签发分区聊天 Socket Ticket' })
  issueChatTicket(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
  ) {
    return this.chatService.issueTicket(
      authorization,
      request.auth!.sessionId,
      matterId,
      areaId,
    );
  }

  /** 将私有分区消息发布为公共区摘要快照。 */
  @Post(':matterId/areas/:areaId/publications')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '发布私有分区公共摘要' })
  publish(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: CreateDiscussionPublicationDto,
  ) {
    return this.chatService.publish(authorization, matterId, areaId, body);
  }
}
