/*
 * @Author: shaoliye
 * @Date: 2026-04-24 13:43:49
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-05-06 12:13:37
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { validateEnvConfig } from './config/env.config';
import { HealthModule } from './modules/health/health.module';
import { AccessManagementModule } from './modules/access-management/access-management.module';
import { AccessTokenGuard } from './modules/auth/guards/access-token.guard';
import { PermissionGuard } from './modules/auth/guards/permission.guard';
import { DecisionsModule } from './modules/decisions/decisions.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';

/** 应用根模块，注册全局认证/权限守卫和全部启用的业务模块。 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvConfig,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    AccessManagementModule,
    ProjectsModule,
    DecisionsModule,
    MeetingsModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  // controllers: [AppController],
  // providers: [AppService],
})
export class AppModule implements NestModule {
  /** 为全部 HTTP 路由建立统一 requestId 上下文。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
