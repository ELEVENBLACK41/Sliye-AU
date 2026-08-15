/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理模块，承载 RBAC 管理接口
 * @Copyright: Copyright 1990 - 2026
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AccessControlCatalogCheckService } from './access-control-catalog-check.service';
import { AccessManagementController } from './access-management.controller';
import { AccessManagementService } from './access-management.service';

/** 访问控制模块，注册管理接口、业务服务和启动期只读目录漂移检查。 */
@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AccessManagementController],
  providers: [AccessManagementService, AccessControlCatalogCheckService],
})
export class AccessManagementModule {}
