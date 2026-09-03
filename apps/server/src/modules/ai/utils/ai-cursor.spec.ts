/**
 * 本文件验证只读列表共用的不透明游标编解码与拒绝规则：
 * 往返一致、跨列表与跨查询条件不可复用、版本失效与结构非法一律返回稳定错误码。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AI_CURSOR_KINDS, decodeAiCursor, encodeAiCursor } from './ai-cursor';

/** 断言解码抛出的是游标非法业务异常，而不是未归一化的运行时错误。 */
function expectInvalidCursor(run: () => unknown): void {
  expect(run).toThrow(BusinessException);
  try {
    run();
  } catch (error) {
    expect((error as BusinessException).code).toBe(
      API_ERROR_CODES.AI_CURSOR_INVALID,
    );
  }
}

/** 用给定负载构造一个结构合法但内容可控的游标。 */
function buildCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('AI 只读列表游标', () => {
  const time = new Date('2026-08-25T12:34:56.789Z');
  const threadListScope = {
    kind: AI_CURSOR_KINDS.THREAD_LIST,
    scope: 'ACTIVE',
  };

  it('编码后解码可以还原排序时间与标识', () => {
    const cursor = encodeAiCursor({ ...threadListScope, time, id: 'record-1' });

    expect(decodeAiCursor(cursor, threadListScope)).toEqual({
      time,
      id: 'record-1',
    });
  });

  it('游标对客户端不透明，不直接暴露标识明文', () => {
    const cursor = encodeAiCursor({ ...threadListScope, time, id: 'record-1' });

    expect(cursor).not.toContain('record-1');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('会话列表游标不能拿去翻消息列表', () => {
    const cursor = encodeAiCursor({ ...threadListScope, time, id: 'record-1' });

    expectInvalidCursor(() =>
      decodeAiCursor(cursor, {
        kind: AI_CURSOR_KINDS.MESSAGE_LIST,
        scope: 'ACTIVE',
      }),
    );
  });

  it('切换查询条件后复用旧游标会被拒绝，而不是返回错乱的分页', () => {
    const cursor = encodeAiCursor({ ...threadListScope, time, id: 'record-1' });

    expectInvalidCursor(() =>
      decodeAiCursor(cursor, {
        kind: AI_CURSOR_KINDS.THREAD_LIST,
        scope: 'ARCHIVED',
      }),
    );
  });

  it('消息游标绑定所属会话，不能跨会话复用', () => {
    const cursor = encodeAiCursor({
      kind: AI_CURSOR_KINDS.MESSAGE_LIST,
      scope: 'thread-a',
      time,
      id: 'message-1',
    });

    expectInvalidCursor(() =>
      decodeAiCursor(cursor, {
        kind: AI_CURSOR_KINDS.MESSAGE_LIST,
        scope: 'thread-b',
      }),
    );
  });

  it('版本不匹配的历史游标被拒绝', () => {
    const cursor = buildCursor({
      v: 999,
      k: AI_CURSOR_KINDS.THREAD_LIST,
      s: 'ACTIVE',
      t: time.toISOString(),
      i: 'record-1',
    });

    expectInvalidCursor(() => decodeAiCursor(cursor, threadListScope));
  });

  it('结构非法或无法解析的游标一律被拒绝', () => {
    const invalidCursors = [
      '',
      '!!!not-base64!!!',
      Buffer.from('not json', 'utf8').toString('base64url'),
      buildCursor(null),
      buildCursor(['array']),
      buildCursor({
        v: 1,
        k: 'THREAD_LIST',
        s: 'ACTIVE',
        t: time.toISOString(),
      }),
      buildCursor({
        v: 1,
        k: 'THREAD_LIST',
        s: 'ACTIVE',
        t: time.toISOString(),
        i: '',
      }),
      buildCursor({
        v: 1,
        k: 'THREAD_LIST',
        s: 'ACTIVE',
        t: 'not-a-date',
        i: 'record-1',
      }),
      buildCursor({
        v: '1',
        k: 'THREAD_LIST',
        s: 'ACTIVE',
        t: time.toISOString(),
        i: 'record-1',
      }),
    ];

    for (const cursor of invalidCursors) {
      expectInvalidCursor(() => decodeAiCursor(cursor, threadListScope));
    }
  });
});
