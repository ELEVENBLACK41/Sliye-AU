/**
 * 本文件提供会议创建、查询、生命周期和 LiveKit 音视频凭证接口。
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateQuickCallDto } from './dto/create-quick-call.dto';
import { ListMeetingParticipantCandidatesDto } from './dto/list-meeting-participant-candidates.dto';
import { RespondMeetingCallDto } from './dto/respond-meeting-call.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ListMeetingCenterOverviewDto } from './dto/list-meeting-center-overview.dto';
import { ListMeetingCenterRecordsDto } from './dto/list-meeting-center-records.dto';
import { MeetingsService } from './meetings.service';
import { MeetingCenterQueryService } from './services/meeting-center-query.service';
import { MeetingCallService } from './services/meeting-call.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';
import { MeetingLiveKitService } from './services/meeting-livekit.service';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller()
export class MeetingsController {
  /** 注入会议生命周期服务。 */
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly meetingCenterQueryService: MeetingCenterQueryService,
    private readonly meetingCallService: MeetingCallService,
    private readonly lifecycleService: MeetingLifecycleService,
    private readonly liveKitService: MeetingLiveKitService,
  ) {}

  /** 查询当前系统内可发起独立会议的正常联系人。 */
  @Get('meetings/participant-candidates')
  @ApiOperation({ summary: '查询会议联系人候选' })
  listParticipantCandidates(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListMeetingParticipantCandidatesDto,
  ) {
    return this.meetingCallService.listParticipantCandidates(
      authorization,
      query,
    );
  }

  /** 发起三十秒振铃的快速语音或视频通话。 */
  @Post('meetings/quick-calls')
  @ApiOperation({ summary: '发起快速通话' })
  createQuickCall(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateQuickCallDto,
  ) {
    return this.meetingCallService.createQuickCall(authorization, body);
  }

  /** 创建可提前三十分钟进入的预约会议。 */
  @Post('meetings/appointments')
  @ApiOperation({ summary: '创建预约会议' })
  createAppointment(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateAppointmentDto,
  ) {
    return this.meetingCallService.createAppointment(authorization, body);
  }

  /** 查询当前用户仍处于振铃期的快速来电。 */
  @Get('meetings/incoming-calls')
  @ApiOperation({ summary: '查询待处理快速来电' })
  listIncomingCalls(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.meetingCallService.listIncomingCalls(authorization);
  }

  /** 查询当前用户跨项目的周日程、进行中会议和后续会议。 */
  @Get('meetings/center/overview')
  @ApiOperation({ summary: '查询会议中心日程概览' })
  getCenterOverview(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListMeetingCenterOverviewDto,
  ) {
    return this.meetingCenterQueryService.getOverview(authorization, query);
  }

  /** 查询当前用户跨项目的会议历史记录。 */
  @Get('meetings/center/records')
  @ApiOperation({ summary: '查询会议中心历史记录' })
  getCenterRecords(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListMeetingCenterRecordsDto,
  ) {
    return this.meetingCenterQueryService.getRecords(authorization, query);
  }

  /** 在项目的当前分区中创建一场计划会议。 */
  @Post('projects/:projectId/meetings')
  @RequirePermissions('project:update')
  @ApiOperation({ summary: '在项目分区中创建会议' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: CreateMeetingDto,
  ) {
    return this.meetingsService.create(authorization, projectId, body);
  }

  /** 查询项目下当前用户可见分区的全部会议。 */
  @Get('projects/:projectId/meetings')
  @RequirePermissions('project:read')
  @ApiOperation({ summary: '查询项目会议列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.meetingsService.list(authorization, projectId);
  }

  /** 查询授权范围内的单场会议详情。 */
  @Get('meetings/:meetingId')
  @ApiOperation({ summary: '查询会议详情和受邀成员' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.meetingsService.get(authorization, meetingId);
  }

  /** 修改当前用户主持且尚未开始的预约会议。 */
  @Patch('meetings/:meetingId')
  @ApiOperation({ summary: '修改预约会议' })
  updateAppointment(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
    @Body() body: UpdateAppointmentDto,
  ) {
    return this.meetingCallService.updateAppointment(
      authorization,
      meetingId,
      body,
    );
  }

  /** 主持人主动取消尚未开始的预约会议。 */
  @Post('meetings/:meetingId/cancel')
  @ApiOperation({ summary: '取消预约会议' })
  cancelAppointment(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.meetingCallService.cancelAppointment(authorization, meetingId);
  }

  /** 当前受邀人接听或拒绝仍在振铃的快速通话。 */
  @Post('meetings/:meetingId/call-response')
  @ApiOperation({ summary: '响应快速通话' })
  respondToCall(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
    @Body() body: RespondMeetingCallDto,
  ) {
    return this.meetingCallService.respondToCall(
      authorization,
      meetingId,
      body,
    );
  }

  /** 为当前受邀用户签发进行中会议的 LiveKit 加入凭证。 */
  @Post('meetings/:meetingId/livekit-token')
  @ApiOperation({ summary: '获取会议 LiveKit 音视频加入凭证' })
  issueLiveKitToken(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.liveKitService.issueCredentials(authorization, meetingId);
  }

  /** 由会议主持人开始一场计划会议。 */
  @Post('meetings/:meetingId/start')
  @ApiOperation({ summary: '开始会议并写入决策事件' })
  start(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.start(authorization, meetingId);
  }

  /** 由会议主持人结束一场进行中的会议。 */
  @Post('meetings/:meetingId/end')
  @ApiOperation({ summary: '结束会议并写入决策事件' })
  end(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.end(authorization, meetingId);
  }
}
