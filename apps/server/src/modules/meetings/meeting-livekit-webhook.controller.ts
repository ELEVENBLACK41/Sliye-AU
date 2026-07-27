/**
 * 本文件提供公开但强制验签的 LiveKit Cloud Webhook 接收端点。
 */
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MeetingLiveKitWebhookService } from './services/meeting-livekit-webhook.service';

@Controller('livekit')
export class MeetingLiveKitWebhookController {
  /** 注入 LiveKit Webhook 处理服务。 */
  constructor(private readonly webhookService: MeetingLiveKitWebhookService) {}

  /** 接收并验签 LiveKit Cloud 房间和参与者事件。 */
  @Post('webhook')
  @Public()
  @HttpCode(204)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    if (!request.rawBody) {
      throw new BadRequestException('LiveKit Webhook 缺少原始请求体');
    }

    await this.webhookService.handle(
      request.rawBody.toString('utf8'),
      authorization,
    );
  }
}
