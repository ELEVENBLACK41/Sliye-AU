/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: Prisma 全局模块，注册后所有模块无需重复导入即可注入 PrismaService
 * @Copyright: Copyright 1990 - 2026
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
