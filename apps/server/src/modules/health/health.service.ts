/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 健康检查服务，提供存活状态和数据库就绪状态
 * @Copyright: Copyright 1990 - 2026
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from './health.types';

@Injectable()
export class HealthService {
  // 注入配置和数据库服务，用于生成健康检查响应。
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // 返回应用进程级存活状态，不依赖外部资源。
  getLiveness(): HealthCheckResponse {
    return this.buildBaseHealth('ok');
  }

  // 检查数据库连接是否可用，用于部署平台 readiness 探针。
  async getReadiness(): Promise<ReadinessCheckResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        ...this.buildBaseHealth('ok'),
        database: 'ok',
      };
    } catch {
      return {
        ...this.buildBaseHealth('error'),
        database: 'error',
      };
    }
  }

  // 组装健康检查响应中的通用字段。
  private buildBaseHealth(status: 'ok' | 'error'): HealthCheckResponse {
    return {
      status,
      service: 'nextnest-server',
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
