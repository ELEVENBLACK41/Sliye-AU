/**
 * 本文件提供会议创建、查询、生命周期和 LiveKit 音视频凭证接口。
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingsService } from './meetings.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';
import { MeetingLiveKitService } from './services/meeting-livekit.service';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller()
export class MeetingsController {
  /** 注入会议生命周期服务。 */
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly lifecycleService: MeetingLifecycleService,
    private readonly liveKitService: MeetingLiveKitService,
  ) {}

  /** 在议事的当前分区中创建一场计划会议。 */
  @Post('matters/:matterId/meetings')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '在议事分区中创建会议' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Body() body: CreateMeetingDto,
  ) {
    return this.meetingsService.create(authorization, matterId, body);
  }

  /** 查询议事下当前用户可见分区的全部会议。 */
  @Get('matters/:matterId/meetings')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询议事会议列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
  ) {
    return this.meetingsService.list(authorization, matterId);
  }

  /** 查询授权范围内的单场会议详情。 */
  @Get('meetings/:meetingId')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '查询会议详情和受邀成员' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.meetingsService.get(authorization, meetingId);
  }

  /** 为当前受邀用户签发进行中会议的 LiveKit 加入凭证。 */
  @Post('meetings/:meetingId/livekit-token')
  @RequirePermissions('matter:read')
  @ApiOperation({ summary: '获取会议 LiveKit 音视频加入凭证' })
  issueLiveKitToken(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.liveKitService.issueCredentials(authorization, meetingId);
  }

  /** 由会议主持人开始一场计划会议。 */
  @Post('meetings/:meetingId/start')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '开始会议并写入决策事件' })
  start(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.start(authorization, meetingId);
  }

  /** 由会议主持人结束一场进行中的会议。 */
  @Post('meetings/:meetingId/end')
  @RequirePermissions('matter:update')
  @ApiOperation({ summary: '结束会议并写入决策事件' })
  end(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.end(authorization, meetingId);
  }
}
