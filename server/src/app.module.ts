/*
 * @Author: shaoliye
 * @Date: 2026-04-24 13:43:49
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-28 16:40:33
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { Module } from '@nestjs/common';
import { TestModule } from './modules/test/test.module';
import { ConfigModule } from '@nestjs/config';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';

@Module({
  imports: [TestModule, ConfigModule.forRoot()],
  // controllers: [AppController],
  // providers: [AppService],
})
export class AppModule {}
