/**
 * 本文件提供单个 AI Run 的文本异步持久化队列。
 *
 * 模型 delta 先由 Runtime 直出，队列只负责按 Run 串行、有限批次地写入 AiEvent；
 * 队列不参与前端渲染，且在 Run 终态前必须由调用方等待冲刷完成。
 */

import type { AiEvent, AiPostStreamLiveDeltaData } from '@workspace/contracts/ai';

/** 发往 NestJS 文本事件接口的一批持久化数据。 */
export type AiRuntimeTextPersistenceBatch = {
  /** 批次所属的 Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
  /** 批次所属的助手消息标识。 */
  messageId: string;
  /** 按模型 delta 原顺序拼接的文本。 */
  delta: string;
  /** 批次中每个即时 delta 的稳定标识。 */
  liveDeltaIds: string[];
  /** 批次中第一个即时 delta 的序号。 */
  liveSequenceStart: number;
  /** 批次中最后一个即时 delta 的序号。 */
  liveSequenceEnd: number;
};

/** 文本持久化队列的配置。 */
export type AiRuntimeTextPersistenceQueueOptions = {
  /** 当前执行器持有的租约标识，不通过 live delta 暴露给浏览器。 */
  executionLeaseId: string;
  /** 把一个批次写入数据库并返回提交后的权威事件。 */
  persist: (batch: AiRuntimeTextPersistenceBatch) => Promise<AiEvent>;
  /** 数据库提交成功后通知 Runtime 发布持久化确认事件。 */
  onPersisted: (event: AiEvent) => void;
  /** 队列不可继续写入时通知 Runtime 终止模型生成。 */
  onFatalError: (error: unknown) => void;
  /** 未完成写入的即时 delta 总数上限。 */
  maxBufferedDeltas?: number;
  /** 单个数据库事件允许聚合的 JavaScript 字符数。 */
  maxBatchCharacters?: number;
  /** 达到该时间仍未达到字符阈值时触发一次持久化。 */
  flushIntervalMs?: number;
};

/** 单个 Run 的异步文本持久化队列。 */
export type AiRuntimeTextPersistenceQueue = {
  /** 立即接受一个 live delta，不等待数据库写入完成。 */
  enqueue: (liveDelta: AiPostStreamLiveDeltaData) => void;
  /** 等待所有已接受 delta 完成持久化；失败时抛出队列错误。 */
  drain: () => Promise<void>;
};

/** 创建按 Run 串行、有界批量写入的文本持久化队列。 */
export function createAiRuntimeTextPersistenceQueue(
  options: AiRuntimeTextPersistenceQueueOptions,
): AiRuntimeTextPersistenceQueue {
  const maxBufferedDeltas = options.maxBufferedDeltas ?? 256;
  const maxBatchCharacters = options.maxBatchCharacters ?? 40;
  const flushIntervalMs = options.flushIntervalMs ?? 100;
  const bufferedDeltas: AiPostStreamLiveDeltaData[] = [];
  let bufferedCharacters = 0;
  let inFlightDeltas = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();
  let fatalError: unknown = null;

  /** 记录队列致命错误并停止继续接收，避免无界积压或静默丢失。 */
  function fail(error: unknown): void {
    if (fatalError !== null) {
      return;
    }

    fatalError = error;
    clearScheduledFlush();
    bufferedDeltas.length = 0;
    bufferedCharacters = 0;

    try {
      options.onFatalError(error);
    } catch {
      // 终止模型的回调失败时仍保留原始队列错误供 drain 抛出。
    }
  }

  /** 清除尚未触发的定时冲刷。 */
  function clearScheduledFlush(): void {
    if (flushTimer === null) {
      return;
    }

    clearTimeout(flushTimer);
    flushTimer = null;
  }

  /** 为当前缓冲安排一次延迟冲刷，避免每个模型 delta 都创建数据库请求。 */
  function scheduleFlush(): void {
    if (flushTimer !== null || fatalError !== null) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBufferedDeltas();
    }, flushIntervalMs);
  }

  /** 取出当前文本批次并追加到串行写入链，不阻塞 enqueue 调用方。 */
  function flushBufferedDeltas(): void {
    if (bufferedDeltas.length === 0 || fatalError !== null) {
      return;
    }

    const deltas = bufferedDeltas.splice(0);
    bufferedCharacters = 0;
    inFlightDeltas += deltas.length;
    writeChain = writeChain
      .then(async () => {
        if (fatalError !== null) {
          return;
        }

        const event = await options.persist(createPersistenceBatch(deltas));
        try {
          options.onPersisted(event);
        } catch {
          // live sink 发布失败不能让已提交的数据库事件重新变成持久化失败。
        }
      })
      .catch((error: unknown) => {
        fail(error);
      })
      .finally(() => {
        inFlightDeltas -= deltas.length;
      });
  }

  /** 把单个 Run 的即时 delta 聚合为一个带完整关联信息的持久化事件请求。 */
  function createPersistenceBatch(deltas: AiPostStreamLiveDeltaData[]): AiRuntimeTextPersistenceBatch {
    const first = deltas[0];
    const last = deltas[deltas.length - 1];

    return {
      runId: first.runId,
      executionLeaseId: options.executionLeaseId,
      messageId: first.messageId,
      delta: deltas.map((delta) => delta.delta).join(''),
      liveDeltaIds: deltas.map((delta) => delta.liveDeltaId),
      liveSequenceStart: first.liveSequence,
      liveSequenceEnd: last.liveSequence,
    };
  }

  /** 接受一个即时模型增量；达到上限时立即触发持久化或失败收敛。 */
  function enqueue(liveDelta: AiPostStreamLiveDeltaData): void {
    if (fatalError !== null) {
      return;
    }

    if (bufferedDeltas.length + inFlightDeltas >= maxBufferedDeltas) {
      fail(new Error('AI 文本持久化队列已满，无法保证直出内容可恢复。'));
      return;
    }

    bufferedDeltas.push(liveDelta);
    bufferedCharacters += liveDelta.delta.length;

    if (bufferedCharacters >= maxBatchCharacters) {
      clearScheduledFlush();
      flushBufferedDeltas();
      return;
    }

    scheduleFlush();
  }

  /** 等待当前批次与串行写入链全部完成，终态提交前必须调用。 */
  async function drain(): Promise<void> {
    clearScheduledFlush();
    flushBufferedDeltas();

    while (bufferedDeltas.length > 0) {
      await writeChain;
      flushBufferedDeltas();
    }
    await writeChain;

    if (fatalError !== null) {
      throw fatalError;
    }
  }

  return { enqueue, drain };
}
