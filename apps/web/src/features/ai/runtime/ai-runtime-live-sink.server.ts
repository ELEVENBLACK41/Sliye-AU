/**
 * 本文件提供进程内 Agent Runtime live sink。
 *
 * sink 只负责把已经提交的事件和状态快照交给当前订阅者，不参与权限、持久化
 * 或 Run 状态机。每个 sink 使用有界队列，慢订阅者只会被关闭，不会反向阻塞模型执行。
 */
import type { AiEvent, AiPostStreamLiveDeltaData, AiPostStreamRunStatusData } from '@workspace/contracts/ai';

/** Runtime live sink 可以向订阅者发布的消息。 */
export type AiRuntimeLiveSinkMessage =
  | {
      /** 模型即时增量消息。 */
      kind: 'LIVE_DELTA';
      /** 未经数据库批处理、按模型实际到达节奏产生的增量。 */
      liveDelta: AiPostStreamLiveDeltaData;
    }
  | {
      /** 已提交的领域事件消息。 */
      kind: 'AI_EVENT';
      /** 可按 `runId + sequence` 去重的权威事件。 */
      event: AiEvent;
    }
  | {
      /** Run 状态快照消息。 */
      kind: 'RUN_STATUS';
      /** 当前 Run 的可恢复状态快照。 */
      status: AiPostStreamRunStatusData;
    };

/** live sink 关闭时可供上层选择恢复策略的稳定原因。 */
export type AiRuntimeLiveSinkCloseReason =
  | 'CLIENT_DISCONNECTED'
  | 'SLOW_CONSUMER'
  | 'WRITER_FAILED'
  | 'SINK_TIMEOUT'
  | 'RUNTIME_FAILED';

/** live sink 写入器与队列配置。 */
export type AiRuntimeLiveSinkOptions = {
  /** 当前订阅者的单次写入函数；可以同步完成或返回 Promise。 */
  write: (message: AiRuntimeLiveSinkMessage) => void | Promise<void>;
  /** 写入器尚未完成时允许排队的最大消息数。 */
  maxBufferedMessages?: number;
  /** sink 关闭时通知上层；回调异常不会影响 Runtime。 */
  onClose?: (reason: AiRuntimeLiveSinkCloseReason) => void;
};

/** 由 Runtime 使用的、具备有界缓冲的 live sink。 */
export type AiRuntimeLiveSink = {
  /** 发布一条模型即时增量；方法不会等待慢订阅者。 */
  publishLiveDelta: (liveDelta: AiPostStreamLiveDeltaData) => void;
  /** 发布一条已提交领域事件；方法不会等待慢订阅者。 */
  publishEvent: (event: AiEvent) => void;
  /** 发布一条状态快照；方法不会等待慢订阅者。 */
  publishStatus: (status: AiPostStreamRunStatusData) => void;
  /** 主动关闭当前订阅并丢弃尚未写出的排队消息。 */
  close: (reason?: AiRuntimeLiveSinkCloseReason) => void;
  /** 等待当前 sink 已接受的消息全部完成写出。 */
  waitForIdle: () => Promise<void>;
};

/** 创建一个隔离于单次 POST 订阅的有界 live sink。 */
export function createAiRuntimeLiveSink(options: AiRuntimeLiveSinkOptions): AiRuntimeLiveSink {
  const maxBufferedMessages = options.maxBufferedMessages ?? 32;
  const bufferedMessages: AiRuntimeLiveSinkMessage[] = [];
  let closed = false;
  let draining = false;
  let drainPromise: Promise<void> | null = null;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  /** 关闭 sink 并通知上层；重复关闭不会重复触发回调。 */
  function close(reason: AiRuntimeLiveSinkCloseReason = 'CLIENT_DISCONNECTED'): void {
    if (closed) {
      return;
    }

    closed = true;
    bufferedMessages.length = 0;
    resolveClosed();

    try {
      options.onClose?.(reason);
    } catch {
      // 订阅者清理失败不能回传到模型执行链。
    }
  }

  /** 将消息放入有界队列；超出上限时关闭慢订阅者并交给恢复流补拉。 */
  function enqueue(message: AiRuntimeLiveSinkMessage): void {
    if (closed) {
      return;
    }

    if (bufferedMessages.length >= maxBufferedMessages) {
      close('SLOW_CONSUMER');
      return;
    }

    bufferedMessages.push(message);
    void drain();
  }

  /** 串行写出队列；写入失败只关闭当前 sink，不影响 Runtime。 */
  function drain(): Promise<void> {
    if (draining || closed) {
      return drainPromise ?? Promise.resolve();
    }

    draining = true;

    drainPromise = (async () => {
      try {
        while (!closed && bufferedMessages.length > 0) {
          const message = bufferedMessages.shift();
          if (!message) {
            return;
          }

          try {
            await options.write(message);
          } catch {
            close('WRITER_FAILED');
            return;
          }
        }
      } finally {
        draining = false;
      }
    })().finally(() => {
      drainPromise = null;
    });

    return drainPromise;
  }

  /** 等待已经进入 sink 的消息完成写出，供终态关闭前冲刷响应。 */
  async function waitForIdle(): Promise<void> {
    while (drainPromise && !closed) {
      await Promise.race([drainPromise, closedPromise]);
    }
  }

  return {
    publishLiveDelta: (liveDelta) => enqueue({ kind: 'LIVE_DELTA', liveDelta }),
    publishEvent: (event) => enqueue({ kind: 'AI_EVENT', event }),
    publishStatus: (status) => enqueue({ kind: 'RUN_STATUS', status }),
    close,
    waitForIdle,
  };
}
