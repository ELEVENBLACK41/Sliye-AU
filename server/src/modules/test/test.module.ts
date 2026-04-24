/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:35:35
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 15:35:49
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: Test module for NestJS application
 * @Copyright: Copyright 1990 - 2026
 */
import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { TestService } from './test.service';

@Module({
  controllers: [TestController],
  providers: [TestService],
})
export class TestModule {}
