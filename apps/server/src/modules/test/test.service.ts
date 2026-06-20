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
  // 注入 Prisma 服务以访问测试数据表。
  constructor(private readonly prisma: PrismaService) {}

  // 查询测试用户数据，必要时写入初始示例数据。
  async getTest() {
    const count = await this.prisma.user.count();
    if (count === 0) {
      await this.prisma.user.createMany({
        data: [
          { email: 'alice@example.com', name: 'Alice' },
          { email: 'bob@example.com', name: 'Bob' },
          { email: 'charlie@example.com', name: 'Charlie' },
        ],
      });
      await this.prisma.post.createMany({
        data: [
          {
            title: 'Hello World',
            content: 'Alice 的第一篇文章',
            published: true,
            authorId: 1,
          },
          {
            title: 'NestJS 入门',
            content: 'Bob 写的 NestJS 教程',
            published: true,
            authorId: 2,
          },
          { title: '草稿', content: null, published: false, authorId: 3 },
        ],
      });
    }
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

  // 返回固定测试消息。
  getTest1() {
    return {
      msg: 'hello nest my name is shaoliye this is a test message11111231231',
    };
  }

  /**
   * 查询所有用户（含关联文章）。
   * 若表中无数据，先执行初始化 seed，再返回结果。
   */
  // 查询所有用户及其关联文章。
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
