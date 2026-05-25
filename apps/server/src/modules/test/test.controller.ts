/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:34:05
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-05-06 00:00:00
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { Controller, Get } from '@nestjs/common';
import { TestService } from './test.service';

@Controller('test')
export class TestController {
  // 注入测试服务以复用测试数据查询逻辑。
  constructor(private readonly testService: TestService) {}

  // 返回测试用户和文章数据。
  @Get()
  getTest() {
    return this.testService.getTest();
  }

  // 返回简单的测试消息。
  @Get('test1')
  getTest1() {
    return this.testService.getTest1();
  }

  /**
   * GET /test/users
   * 获取用户列表（含关联文章）。
   * 若表中无数据，自动写入种子数据后再返回。
   */
  // 获取用户列表及其关联文章。
  @Get('users')
  getUsers() {
    return this.testService.getUsers();
  }
}
