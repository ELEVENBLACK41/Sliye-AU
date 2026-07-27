/**
 * 本文件注册会议领域、生命周期和 LiveKit 音视频相关的控制器与服务。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MattersModule } from '../matters/matters.module';
import { MeetingLiveKitWebhookController } from './meeting-livekit-webhook.controller';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';
import { MeetingContextService } from './services/meeting-context.service';
import { MeetingLiveKitService } from './services/meeting-livekit.service';
import { MeetingLiveKitWebhookService } from './services/meeting-livekit-webhook.service';

@Module({
  imports: [AuthModule, MattersModule],
  controllers: [MeetingsController, MeetingLiveKitWebhookController],
  providers: [
    MeetingsService,
    MeetingContextService,
    MeetingLifecycleService,
    MeetingLiveKitService,
    MeetingLiveKitWebhookService,
  ],
  exports: [MeetingContextService],
})
export class MeetingsModule {}
