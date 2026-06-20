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
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { validateEnvConfig } from './config/env.config';
import { HealthModule } from './modules/health/health.module';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvConfig,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
  ],
  // controllers: [AppController],
  // providers: [AppService],
})
export class AppModule {}
