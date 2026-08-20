/**
 * 本文件注册新版工作台的只读聚合接口与查询服务。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardQueryService } from './dashboard-query.service';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardQueryService],
})
export class DashboardModule {}
