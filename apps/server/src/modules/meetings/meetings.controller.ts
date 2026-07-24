/**
 * 本文件提供无音视频会议的创建、查询、开始和结束接口。
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

@ApiTags('meetings')
@ApiBearerAuth()
@Controller()
export class MeetingsController {
  /** 注入会议生命周期服务。 */
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly lifecycleService: MeetingLifecycleService,
  ) {}

  /** 在授权范围内的决策中创建一场计划会议。 */
  @Post('decisions/:decisionId/meetings')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '为决策创建会议并同步参与者' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: CreateMeetingDto,
  ) {
    return this.meetingsService.create(authorization, decisionId, body);
  }

  /** 查询授权范围内某项决策的全部会议。 */
  @Get('decisions/:decisionId/meetings')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策会议列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.meetingsService.list(authorization, decisionId);
  }

  /** 查询授权范围内的单场会议详情。 */
  @Get('meetings/:meetingId')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询会议详情和受邀成员' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.meetingsService.get(authorization, meetingId);
  }

  /** 由会议主持人开始一场计划会议。 */
  @Post('meetings/:meetingId/start')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '开始会议并写入决策事件' })
  start(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.start(authorization, meetingId);
  }

  /** 由会议主持人结束一场进行中的会议。 */
  @Post('meetings/:meetingId/end')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '结束会议并写入决策事件' })
  end(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('meetingId', ParseIntPipe) meetingId: number,
  ) {
    return this.lifecycleService.end(authorization, meetingId);
  }
}
