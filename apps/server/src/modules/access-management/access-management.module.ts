/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理模块，承载 RBAC 管理接口
 * @Copyright: Copyright 1990 - 2026
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessManagementController } from './access-management.controller';
import { AccessManagementService } from './access-management.service';

@Module({
  imports: [AuthModule],
  controllers: [AccessManagementController],
  providers: [AccessManagementService],
})
export class AccessManagementModule {}
