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
  constructor(private readonly testService: TestService) {}

  @Get()
  getTest() {
    return this.testService.getTest();
  }

  @Get('test1')
  getTest1() {
    return this.testService.getTest1();
  }

  /**
   * GET /test/users
   * 获取用户列表（含关联文章）。
   * 若表中无数据，自动写入种子数据后再返回。
   */
  @Get('users')
  getUsers() {
    return this.testService.getUsers();
  }
}
