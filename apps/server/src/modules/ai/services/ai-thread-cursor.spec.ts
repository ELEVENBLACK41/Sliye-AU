/**
 * 本文件验证 Thread 列表不透明游标的编解码与拒绝规则：
 * 往返一致、跨筛选条件不可复用、版本失效与结构非法一律返回稳定错误码。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { decodeAiThreadCursor, encodeAiThreadCursor } from './ai-thread-cursor';

/** 断言解码抛出的是游标非法业务异常，而不是未归一化的运行时错误。 */
function expectInvalidCursor(run: () => unknown): void {
  expect(run).toThrow(BusinessException);
  try {
    run();
  } catch (error) {
    expect((error as BusinessException).code).toBe(
      API_ERROR_CODES.AI_THREAD_CURSOR_INVALID,
    );
  }
}

/** 用给定负载构造一个结构合法但内容可控的游标。 */
function buildCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('AI Thread 列表游标', () => {
  const updatedAt = new Date('2026-08-25T12:34:56.789Z');

  it('编码后解码可以还原排序时间与标识', () => {
    const cursor = encodeAiThreadCursor({
      filter: 'ACTIVE',
      updatedAt,
      id: 'thread-001',
    });

    expect(decodeAiThreadCursor(cursor, 'ACTIVE')).toEqual({
      updatedAt,
      id: 'thread-001',
    });
  });

  it('游标对客户端不透明，不直接暴露标识明文', () => {
    const cursor = encodeAiThreadCursor({
      filter: 'ACTIVE',
      updatedAt,
      id: 'thread-001',
    });

    expect(cursor).not.toContain('thread-001');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('切换筛选条件后复用旧游标会被拒绝，而不是返回错乱的分页', () => {
    const cursor = encodeAiThreadCursor({
      filter: 'ACTIVE',
      updatedAt,
      id: 'thread-001',
    });

    expectInvalidCursor(() => decodeAiThreadCursor(cursor, 'ARCHIVED'));
    expectInvalidCursor(() => decodeAiThreadCursor(cursor, 'ALL'));
  });

  it('版本不匹配的历史游标被拒绝', () => {
    const cursor = buildCursor({
      v: 999,
      f: 'ACTIVE',
      t: updatedAt.toISOString(),
      i: 'thread-001',
    });

    expectInvalidCursor(() => decodeAiThreadCursor(cursor, 'ACTIVE'));
  });

  it('结构非法或无法解析的游标一律被拒绝', () => {
    const invalidCursors = [
      '',
      '!!!not-base64!!!',
      Buffer.from('not json', 'utf8').toString('base64url'),
      buildCursor(null),
      buildCursor(['array']),
      buildCursor({ v: 1, f: 'ACTIVE', t: updatedAt.toISOString() }),
      buildCursor({ v: 1, f: 'ACTIVE', t: updatedAt.toISOString(), i: '' }),
      buildCursor({ v: 1, f: 'ACTIVE', t: 'not-a-date', i: 'thread-001' }),
      buildCursor({ v: '1', f: 'ACTIVE', t: updatedAt.toISOString(), i: 'x' }),
    ];

    for (const cursor of invalidCursors) {
      expectInvalidCursor(() => decodeAiThreadCursor(cursor, 'ACTIVE'));
    }
  });
});
