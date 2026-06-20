/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 健康检查控制器，对外提供 liveness 和 readiness 接口
 * @Copyright: Copyright 1990 - 2026
 */
import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  // 注入健康检查服务。
  constructor(private readonly healthService: HealthService) {}

  // 返回进程存活状态。
  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: '服务存活检查' })
  liveness() {
    return this.healthService.getLiveness();
  }

  // 返回服务就绪状态，数据库不可用时返回 503。
  @Get('ready')
  @HttpCode(200)
  @ApiOperation({ summary: '服务就绪检查' })
  async readiness() {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status !== 'ok') {
      throw new ServiceUnavailableException('Server is not ready');
    }

    return readiness;
  }
}
