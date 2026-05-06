/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:34:43
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-05-06 16:54:41
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TestService {
  constructor(private readonly prisma: PrismaService) {}

  getTest() {
    return this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: {
        posts: {
          select: { id: true, title: true, content: true, published: true },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  getTest1() {
    return {
      msg: 'hello nest my name is shaoliye this is a test message11111231231',
    };
  }

  /**
   * 查询所有用户（含关联文章）。
   * 若表中无数据，先执行初始化 seed，再返回结果。
   */
  async getUsers() {
    return this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: {
        posts: {
          select: { id: true, title: true, content: true, published: true },
          orderBy: { id: 'asc' },
        },
      },
    });
  }
}
