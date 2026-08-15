/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 健康检查模块，承载服务存活与就绪探针
 * @Copyright: Copyright 1990 - 2026
 */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
