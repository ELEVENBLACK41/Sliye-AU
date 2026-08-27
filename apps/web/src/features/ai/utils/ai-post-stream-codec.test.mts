/**
 * 本文件验证 POST 直出流线协议在完整文本、任意 chunk 边界和异常输入下的行为。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiPostStreamFrame } from '@workspace/contracts/ai';

import {
  AiPostStreamProtocolError,
  createAiPostStreamDecoder,
  encodeAiPostStreamFrame,
} from './ai-post-stream-codec.ts';

/** 构造一组覆盖五类协议帧的固定测试数据。 */
function createFrames(): AiPostStreamFrame[] {
  return [
    {
      event: 'submission',
      data: {
        threadId: 'thread-1',
        messageId: 'message-1',
        runId: 'run-1',
        dispatchState: 'DISPATCHED',
        queueSequence: 1,
        submissionMode: 'NORMAL',
        replayed: false,
      },
    },
    {
      event: 'ai-event',
      data: {
        id: 'event-1',
        runId: 'run-1',
        sequence: 1,
        createdAt: '2026-08-27T00:00:00.000Z',
        type: 'ASSISTANT_TEXT_DELTA',
        data: { messageId: 'assistant-1', delta: '第一行\n第二行' },
      },
    },
    {
      event: 'run-status',
      data: {
        runId: 'run-1',
        threadId: 'thread-1',
        status: 'RUNNING',
        cancellationReason: null,
        failureReason: null,
        failureCode: null,
        lastSequence: 1,
      },
    },
    {
      event: 'stream-handoff',
      data: {
        runId: 'run-1',
        threadId: 'thread-1',
        afterSequence: 1,
        reason: 'RECOVERY_REQUIRED',
      },
    },
    {
      event: 'stream-error',
      data: {
        code: 'COMMON.INTERNAL_ERROR',
        message: '实时回答暂时不可用',
        requestId: 'request-1',
      },
    },
  ];
}

test('POST 直出流五类帧可以编码并按任意 chunk 边界解码', () => {
  const frames = createFrames();
  const encoded = frames.map(encodeAiPostStreamFrame).join('');
  const decoder = createAiPostStreamDecoder();
  const decoded = [];

  for (let index = 0; index < encoded.length; index += 3) {
    decoded.push(...decoder.push(encoded.slice(index, index + 3)));
  }
  decoder.finish();

  assert.deepEqual(decoded, frames);
});

test('解码器支持 CRLF 与单个 data 字段中的 JSON 换行转义', () => {
  const decoder = createAiPostStreamDecoder();
  const encoded = encodeAiPostStreamFrame(createFrames()[1]).replace(/\n/g, '\r\n');

  assert.deepEqual(decoder.push(encoded), [
    {
      event: 'ai-event',
      data: {
        id: 'event-1',
        runId: 'run-1',
        sequence: 1,
        createdAt: '2026-08-27T00:00:00.000Z',
        type: 'ASSISTANT_TEXT_DELTA',
        data: { messageId: 'assistant-1', delta: '第一行\n第二行' },
      },
    },
  ]);
  decoder.finish();
});

test('未知事件、缺少 data 和不完整帧都被识别为协议错误', () => {
  const unknownEventDecoder = createAiPostStreamDecoder();
  assert.throws(
    () => unknownEventDecoder.push('event: unknown\ndata: {}\n\n'),
    (error: unknown) => error instanceof AiPostStreamProtocolError,
  );

  const missingDataDecoder = createAiPostStreamDecoder();
  assert.throws(
    () => missingDataDecoder.push('event: submission\n\n'),
    (error: unknown) => error instanceof AiPostStreamProtocolError,
  );

  const incompleteDecoder = createAiPostStreamDecoder();
  incompleteDecoder.push('event: submission\ndata: {}');
  assert.throws(
    () => incompleteDecoder.finish(),
    (error: unknown) => error instanceof AiPostStreamProtocolError,
  );
});
