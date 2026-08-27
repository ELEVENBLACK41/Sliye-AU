/**
 * 本文件提供 AI POST 直出流的纯 SSE 编解码器。
 *
 * 编解码器只负责线协议：支持任意网络 chunk 边界、命名事件和 JSON data，
 * 不负责 Run 状态机、事件去重或权限判断；这些职责继续由上层消费逻辑处理。
 */

import {
  AI_POST_STREAM_EVENT_NAMES,
  type AiPostStreamEventName,
  type AiPostStreamFrame,
  type AiPostStreamWireFrame,
} from '@workspace/contracts/ai';

/** POST 直出流线协议解析失败时使用的错误类型。 */
export class AiPostStreamProtocolError extends Error {
  /** 创建带稳定错误名称的协议解析错误。 */
  constructor(message: string) {
    super(message);
    this.name = 'AiPostStreamProtocolError';
  }
}

/** 序列化一条 POST 直出流帧，输出可直接写入 ReadableStream 的 SSE 文本。 */
export function encodeAiPostStreamFrame(frame: AiPostStreamFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}

/** 可增量消费网络文本 chunk 的 POST 直出流解码器。 */
export type AiPostStreamDecoder = {
  /** 写入一段网络文本，并返回其中已经完整解析的帧。 */
  push: (chunk: string) => AiPostStreamWireFrame[];
  /** 标记输入结束；存在不完整帧时抛出协议错误。 */
  finish: () => void;
};

/** 创建一个不会跨请求共享状态的 POST 直出流解码器。 */
export function createAiPostStreamDecoder(): AiPostStreamDecoder {
  let bufferedText = '';

  return {
    push(chunk: string): AiPostStreamWireFrame[] {
      bufferedText += chunk;
      const frames: AiPostStreamWireFrame[] = [];

      while (true) {
        const boundary = findEventBoundary(bufferedText);
        if (!boundary) {
          break;
        }

        const block = bufferedText.slice(0, boundary.index);
        bufferedText = bufferedText.slice(boundary.index + boundary.length);
        if (block.trim().length === 0) {
          continue;
        }

        frames.push(decodeEventBlock(block));
      }

      return frames;
    },

    finish(): void {
      if (bufferedText.trim().length > 0) {
        throw new AiPostStreamProtocolError('POST 直出流在结束时包含不完整的 SSE 帧');
      }
    },
  };
}

/** 在同时支持 LF 和 CRLF 的前提下找到下一个完整 SSE 事件块。 */
function findEventBoundary(input: string): { index: number; length: number } | null {
  const lfIndex = input.indexOf('\n\n');
  const crlfIndex = input.indexOf('\r\n\r\n');

  if (lfIndex === -1 && crlfIndex === -1) {
    return null;
  }

  if (lfIndex === -1 || (crlfIndex !== -1 && crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 };
  }

  return { index: lfIndex, length: 2 };
}

/** 把一个完整 SSE 事件块解析为命名事件与 JSON data。 */
function decodeEventBlock(block: string): AiPostStreamWireFrame {
  let eventName: string | null = null;
  const dataLines: string[] = [];
  const lines = block.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    if (line.startsWith(':') || line.length === 0) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'event') {
      if (eventName !== null) {
        throw new AiPostStreamProtocolError('POST 直出流帧重复声明 event 字段');
      }
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (!eventName || !isAiPostStreamEventName(eventName)) {
    throw new AiPostStreamProtocolError(`POST 直出流帧包含未知事件：${eventName ?? '未声明'}`);
  }

  if (dataLines.length === 0) {
    throw new AiPostStreamProtocolError(`POST 直出流事件 ${eventName} 缺少 data 字段`);
  }

  try {
    return {
      event: eventName,
      data: JSON.parse(dataLines.join('\n')) as unknown,
    };
  } catch {
    throw new AiPostStreamProtocolError(`POST 直出流事件 ${eventName} 的 data 不是合法 JSON`);
  }
}

/** 判断事件名是否属于已冻结的 POST 直出流协议。 */
function isAiPostStreamEventName(value: string): value is AiPostStreamEventName {
  return (AI_POST_STREAM_EVENT_NAMES as readonly string[]).includes(value);
}
