/**
 * 本文件验证基础上下文预算：只取最近若干条已分发用户消息与已生成助手消息、
 * 排除当前 Run 自己的消息、逐条截断过长正文，并在超出总预算时丢弃最旧消息。
 * 不连接真实数据库，Prisma 为内存 mock。
 */

import { AiContextBudgetService } from './ai-context-budget.service';

describe('AiContextBudgetService', () => {
  /** 创建 mock Prisma 的上下文预算服务。 */
  function createService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { aiMessage: { findMany } };

    return {
      service: new AiContextBudgetService(prisma as never),
      findMany,
    };
  }

  it('只查询已分发用户消息与非空助手消息，并排除当前 Run 的用户消息', async () => {
    const { service, findMany } = createService();

    await service.buildRecentMessages({
      threadId: 'thread-001',
      currentUserMessageId: 'message-current',
    });

    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      threadId: 'thread-001',
      id: { not: 'message-current' },
      OR: [
        { role: 'USER', dispatchState: 'DISPATCHED' },
        { role: 'ASSISTANT', NOT: { content: '' } },
      ],
    });
    expect(query.take).toBe(12);
  });

  it('把倒序查询结果还原为时间正序，并映射为模型消息角色', async () => {
    const { service, findMany } = createService();
    findMany.mockResolvedValue([
      { role: 'ASSISTANT', content: '第二轮回答' },
      { role: 'USER', content: '第二轮提问' },
      { role: 'ASSISTANT', content: '第一轮回答' },
    ]);

    await expect(
      service.buildRecentMessages({
        threadId: 'thread-001',
        currentUserMessageId: 'message-current',
      }),
    ).resolves.toEqual([
      { role: 'ASSISTANT', content: '第一轮回答' },
      { role: 'USER', content: '第二轮提问' },
      { role: 'ASSISTANT', content: '第二轮回答' },
    ]);
  });

  it('单条超长消息会被截断并显式标记', async () => {
    const { service, findMany } = createService();
    findMany.mockResolvedValue([{ role: 'USER', content: 'A'.repeat(2_500) }]);

    const messages = await service.buildRecentMessages({
      threadId: 'thread-001',
      currentUserMessageId: 'message-current',
    });

    expect(messages[0].content).toBe(`${'A'.repeat(2_000)}…（历史消息已截断）`);
  });

  it('总长度超出预算时从最旧的消息开始丢弃', async () => {
    const { service, findMany } = createService();
    // 查询按时间倒序返回：下标 0 是最新消息，下标 11 是最旧消息。
    findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_unused, index) => ({
        role: 'USER',
        content: `${index}`.padEnd(2_000, 'A'),
      })),
    );

    const messages = await service.buildRecentMessages({
      threadId: 'thread-001',
      currentUserMessageId: 'message-current',
    });

    // 合计 24000 字符超出 16000 预算，因此丢弃最旧的 4 条（下标 11～8），
    // 结果按时间正序保留下标 7～0。
    expect(messages).toHaveLength(8);
    expect(messages[0].content.startsWith('7')).toBe(true);
    expect(messages.at(-1)?.content.startsWith('0')).toBe(true);
  });
});
