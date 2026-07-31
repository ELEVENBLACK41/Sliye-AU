/**
 * 本文件提供项目、成员、分区、分区聊天和 Ticket 的 HTTP 接口。
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
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateDiscussionAreaDto } from './dto/create-discussion-area.dto';
import { CreateProjectChatMessageDto } from './dto/create-project-chat-message.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectChatMessagesDto } from './dto/list-project-chat-messages.dto';
import { ListProjectMemberCandidatesDto } from './dto/list-project-member-candidates.dto';
import { UpdateDiscussionAreaDto } from './dto/update-discussion-area.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { DiscussionAreaService } from './services/discussion-area.service';
import { ProjectChatService } from './services/project-chat.service';
import { ProjectCoreService } from './services/project-core.service';
import { ProjectMemberService } from './services/project-member.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  /** 注入项目各职责服务，控制器只负责路由和参数转发。 */
  constructor(
    private readonly coreService: ProjectCoreService,
    private readonly memberService: ProjectMemberService,
    private readonly areaService: DiscussionAreaService,
    private readonly chatService: ProjectChatService,
  ) {}

  /** 查询当前用户作为成员加入的项目列表。 */
  @Get()
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询当前用户的项目列表' })
  list(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.coreService.list(authorization);
  }

  /** 创建项目、负责人关系和唯一公共讨论区。 */
  @Post()
  @RequirePermissions('project:create')
  @ApiOperation({ summary: '创建项目空间' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateProjectDto,
  ) {
    return this.coreService.create(authorization, body);
  }

  /** 查询当前用户可见的项目详情。 */
  @Get(':projectId')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询项目详情' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.coreService.get(authorization, projectId);
  }

  /** 关闭、重开或归档项目。 */
  @Patch(':projectId/status')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '更新项目生命周期' })
  updateStatus(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: UpdateProjectStatusDto,
  ) {
    return this.coreService.updateStatus(authorization, projectId, body);
  }

  /** 查询项目成员列表。 */
  @Get(':projectId/members')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询项目成员' })
  listMembers(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.memberService.list(authorization, projectId);
  }

  /** 查询尚未加入当前项目的可用用户候选列表。 */
  @Get(':projectId/member-candidates')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '查询项目可加入成员候选' })
  listMemberCandidates(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query() query: ListProjectMemberCandidatesDto,
  ) {
    return this.memberService.listCandidates(authorization, projectId, query);
  }

  /** 向项目添加成员。 */
  @Post(':projectId/members')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '添加项目成员' })
  addMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: AddProjectMemberDto,
  ) {
    return this.memberService.add(authorization, projectId, body);
  }

  /** 修改非负责人的项目成员角色。 */
  @Patch(':projectId/members/:userId')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '修改项目成员角色' })
  updateMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateProjectMemberDto,
  ) {
    return this.memberService.update(authorization, projectId, userId, body);
  }

  /** 移除项目成员并立即撤销实时访问。 */
  @Delete(':projectId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '移除项目成员' })
  removeMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.memberService.remove(authorization, projectId, userId);
  }

  /** 查询当前用户可见的公共区和私有分区。 */
  @Get(':projectId/areas')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询可见讨论分区' })
  listAreas(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.areaService.list(authorization, projectId);
  }

  /** 创建私有讨论分区。 */
  @Post(':projectId/areas')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '创建私有讨论分区' })
  createArea(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: CreateDiscussionAreaDto,
  ) {
    return this.areaService.create(authorization, projectId, body);
  }

  /** 更新讨论分区资料或私有分区状态。 */
  @Patch(':projectId/areas/:areaId')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '更新讨论分区' })
  updateArea(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: UpdateDiscussionAreaDto,
  ) {
    return this.areaService.update(authorization, projectId, areaId, body);
  }

  /** 查询私有分区成员列表。 */
  @Get(':projectId/areas/:areaId/members')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询私有分区成员' })
  listAreaMembers(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
  ) {
    return this.areaService.listMembers(authorization, projectId, areaId);
  }

  /** 向私有分区添加项目成员。 */
  @Post(':projectId/areas/:areaId/members')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '添加私有分区成员' })
  addAreaMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: AddDiscussionAreaMemberDto,
  ) {
    return this.areaService.addMember(authorization, projectId, areaId, body);
  }

  /** 移除私有分区成员并立即撤销实时访问。 */
  @Delete(':projectId/areas/:areaId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '移除私有分区成员' })
  removeAreaMember(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.areaService.removeMember(
      authorization,
      projectId,
      areaId,
      userId,
    );
  }

  /** 查询当前分区消息，支持会议和决策筛选。 */
  @Get(':projectId/areas/:areaId/messages')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询分区聊天消息' })
  listMessages(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Query() query: ListProjectChatMessagesDto,
  ) {
    return this.chatService.list(authorization, projectId, areaId, query);
  }

  /** 发送一条分区文字消息。 */
  @Post(':projectId/areas/:areaId/messages')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '发送分区聊天消息' })
  createMessage(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
    @Body() body: CreateProjectChatMessageDto,
  ) {
    return this.chatService.create(authorization, projectId, areaId, body);
  }

  /** 为当前会话签发只绑定当前分区的 Socket Ticket。 */
  @Post(':projectId/areas/:areaId/chat-ticket')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '签发分区聊天 Socket Ticket' })
  issueChatTicket(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
  ) {
    return this.chatService.issueTicket(
      authorization,
      request.auth!.sessionId,
      projectId,
      areaId,
    );
  }
}
