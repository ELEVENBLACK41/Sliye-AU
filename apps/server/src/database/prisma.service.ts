/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: Prisma 数据库服务，全局单例，负责连接管理
 *               Prisma 7 不再支持 schema 中写 url，需通过 driver adapter 传递连接。
 * @Copyright: Copyright 1990 - 2026
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  // 初始化 Prisma PostgreSQL 适配器并交给 PrismaClient。
  constructor(configService: ConfigService) {
    // Prisma 7 通过 driver adapter 传入数据库连接，不再支持 schema 中写 url
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  // 模块启动时建立数据库连接。
  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  // 模块销毁时关闭数据库连接。
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
