/**
 * 本文件注册无音视频会议生命周期相关的控制器与服务。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MattersModule } from '../matters/matters.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';
import { MeetingContextService } from './services/meeting-context.service';

@Module({
  imports: [AuthModule, MattersModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingContextService, MeetingLifecycleService],
  exports: [MeetingContextService],
})
export class MeetingsModule {}
