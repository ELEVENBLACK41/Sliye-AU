/**
 * 本文件验证 Thread 只读查询的范围条件与分页语义：
 * 所有者与未固定条件恒定生效、归档筛选、条数收敛、keyset 游标条件，
 * 以及详情的不存在归一化和活跃 Run 快照规则。不连接真实数据库，Prisma 为内存 mock。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { Prisma } from '../../../generated/prisma';
import { AI_CURSOR_KINDS, decodeAiCursor } from './ai-cursor';
import { AiThreadQueryService } from './ai-thread-query.service';

/** 构造一行数据库投影结果。 */
function buildRow(overrides: { id: string; updatedAt: Date }) {
  return {
    id: overrides.id,
    title: `会话 ${overrides.id}`,
    activeRunId: null,
    pinnedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt,
  };
}

describe('AiThreadQueryService', () => {
  /** 创建 mock Prisma 的只读查询服务。 */
  function createService() {
    const findMany = jest.fn<
      Promise<ReturnType<typeof buildRow>[]>,
      [Prisma.AiThreadFindManyArgs]
    >();
    findMany.mockResolvedValue([]);
    const findFirst = jest.fn<
      Promise<unknown>,
      [Prisma.AiThreadFindFirstArgs]
    >();
    findFirst.mockResolvedValue(null);
    const prisma = { aiThread: { findMany, findFirst } };

    return {
      service: new AiThreadQueryService(prisma as never),
      findMany,
      findFirst,
    };
  }

  describe('列表', () => {
    it('恒定按所有者与未固定过滤，缺省只返回未归档会话', async () => {
      const { service, findMany } = createService();

      await service.listThreads(7, {});

      const args = findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        ownerUserId: 7,
        pinnedAt: null,
        archivedAt: null,
      });
      expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    });

    it('归档筛选只改变归档条件，不放宽所有者与未固定条件', async () => {
      const { service, findMany } = createService();

      await service.listThreads(7, { filter: 'ARCHIVED' });
      expect(findMany.mock.calls[0][0].where).toEqual({
        ownerUserId: 7,
        pinnedAt: null,
        archivedAt: { not: null },
      });

      await service.listThreads(7, { filter: 'ALL' });
      expect(findMany.mock.calls[1][0].where).toEqual({
        ownerUserId: 7,
        pinnedAt: null,
      });
    });

    it('请求条数收敛到上限，非法值回落默认值，并多取一条判断是否还有下一页', async () => {
      const { service, findMany } = createService();

      await service.listThreads(7, { limit: 999 });
      expect(findMany.mock.calls[0][0].take).toBe(51);

      await service.listThreads(7, { limit: 0 });
      expect(findMany.mock.calls[1][0].take).toBe(21);

      await service.listThreads(7, { limit: 5 });
      expect(findMany.mock.calls[2][0].take).toBe(6);
    });

    it('多出一条时截断当前页并给出可继续翻页的游标', async () => {
      const { service, findMany } = createService();
      const rows = [
        buildRow({ id: 'a', updatedAt: new Date('2026-08-25T10:00:00.000Z') }),
        buildRow({ id: 'b', updatedAt: new Date('2026-08-25T09:00:00.000Z') }),
        buildRow({ id: 'c', updatedAt: new Date('2026-08-25T08:00:00.000Z') }),
      ];
      findMany.mockResolvedValue(rows);

      const page = await service.listThreads(7, { limit: 2 });

      expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
      expect(page.hasMore).toBe(true);
      // 游标指向本页最后一条，而不是被截掉的那条。
      expect(
        decodeAiCursor(page.nextCursor!, {
          kind: AI_CURSOR_KINDS.THREAD_LIST,
          scope: 'ACTIVE',
        }),
      ).toEqual({ time: new Date('2026-08-25T09:00:00.000Z'), id: 'b' });
    });

    it('没有更多数据时不返回游标', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([
        buildRow({ id: 'a', updatedAt: new Date('2026-08-25T10:00:00.000Z') }),
      ]);

      const page = await service.listThreads(7, { limit: 2 });

      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('游标转换为 keyset 条件：时间更早，或时间相同但标识更小', async () => {
      const { service, findMany } = createService();
      const updatedAt = new Date('2026-08-25T09:00:00.000Z');
      findMany.mockResolvedValue([
        buildRow({ id: 'b', updatedAt }),
        buildRow({ id: 'c', updatedAt }),
      ]);
      const first = await service.listThreads(7, { limit: 1 });

      await service.listThreads(7, { limit: 1, cursor: first.nextCursor! });

      expect(findMany.mock.calls[1][0].where).toEqual({
        ownerUserId: 7,
        pinnedAt: null,
        archivedAt: null,
        OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: 'b' } }],
      });
    });

    it('时间统一序列化为 ISO 字符串', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([
        buildRow({ id: 'a', updatedAt: new Date('2026-08-25T10:00:00.000Z') }),
      ]);

      const page = await service.listThreads(7, {});

      expect(page.items[0]).toMatchObject({
        updatedAt: '2026-08-25T10:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
        pinnedAt: null,
        archivedAt: null,
      });
    });
  });

  describe('详情', () => {
    it('非所有者或不存在都归一化为同一个不存在错误', async () => {
      const { service, findFirst } = createService();

      await expect(
        service.getThreadDetail(7, 'thread-x'),
      ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
      expect(findFirst.mock.calls[0][0].where).toEqual({
        id: 'thread-x',
        ownerUserId: 7,
      });
    });

    it('返回非终态活跃 Run 快照', async () => {
      const { service, findFirst } = createService();
      findFirst.mockResolvedValue({
        ...buildRow({
          id: 'a',
          updatedAt: new Date('2026-08-25T10:00:00.000Z'),
        }),
        activeRunId: 'run-1',
        activeRun: {
          id: 'run-1',
          status: 'RUNNING',
          createdAt: new Date('2026-08-25T09:59:00.000Z'),
        },
      });

      await expect(service.getThreadDetail(7, 'a')).resolves.toMatchObject({
        activeRun: {
          runId: 'run-1',
          status: 'RUNNING',
          createdAt: '2026-08-25T09:59:00.000Z',
        },
      });
    });

    it('活跃指针指向终态 Run 时按无活跃 Run 返回，不把终态当成进行中', async () => {
      const { service, findFirst } = createService();
      findFirst.mockResolvedValue({
        ...buildRow({
          id: 'a',
          updatedAt: new Date('2026-08-25T10:00:00.000Z'),
        }),
        activeRunId: 'run-1',
        activeRun: {
          id: 'run-1',
          status: 'COMPLETED',
          createdAt: new Date('2026-08-25T09:59:00.000Z'),
        },
      });

      await expect(service.getThreadDetail(7, 'a')).resolves.toMatchObject({
        activeRun: null,
      });
    });
  });
});
