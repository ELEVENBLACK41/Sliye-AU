/**
 * 本文件负责 Thread 列表不透明游标的编码与解码。
 *
 * 列表按 `updatedAt` 倒序，但时间戳会重复；只用时间做游标会在同一时刻的多条会话之间
 * 产生重复项或漏项，因此游标同时承载排序时间和 Thread 标识做 keyset 分页。
 *
 * 游标对客户端不透明：它只是分页位置，不是凭据。
 * 这里做的是**结构校验**而不是防篡改签名——数据范围由 SQL 中的所有者条件独立保证，
 * 伪造游标最多只能改变自己会话列表的起始位置，读不到任何他人数据，
 * 因此不需要 HMAC 之类的签名成本。非法或结构不符的游标一律返回稳定错误，
 * 不静默降级为“从头开始”，避免客户端在翻页出错时无声地重复消费第一页。
 */

import { HttpStatus } from '@nestjs/common';
import type { AiThreadListFilter } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';

/** 当前游标编码版本；结构调整时递增，旧版本游标一律拒绝。 */
const AI_THREAD_CURSOR_VERSION = 1;

/** 解码后的游标位置，对应 keyset 分页的上一条记录。 */
export type AiThreadCursor = {
  /** 上一页最后一条会话的最后活动时间。 */
  updatedAt: Date;
  /** 上一页最后一条会话的标识，用于同一时间戳内的稳定排序。 */
  id: string;
};

/** 游标内部的序列化结构；字段名保持简短以缩短游标长度。 */
type AiThreadCursorPayload = {
  /** 编码版本。 */
  v: number;
  /** 生成该游标时使用的归档筛选条件。 */
  f: AiThreadListFilter;
  /** 排序时间的 ISO 8601 字符串。 */
  t: string;
  /** Thread 标识。 */
  i: string;
};

/** 把一条会话的位置编码为不透明游标。 */
export function encodeAiThreadCursor(input: {
  filter: AiThreadListFilter;
  updatedAt: Date;
  id: string;
}): string {
  const payload: AiThreadCursorPayload = {
    v: AI_THREAD_CURSOR_VERSION,
    f: input.filter,
    t: input.updatedAt.toISOString(),
    i: input.id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * 解码游标并校验它与本次请求的筛选条件一致。
 *
 * 换了 `filter` 还继续用旧游标会得到与预期不同的结果集，
 * 这里把它定义为稳定错误而不是让客户端拿到静默错乱的分页。
 */
export function decodeAiThreadCursor(
  cursor: string,
  expectedFilter: AiThreadListFilter,
): AiThreadCursor {
  const payload = parseCursorPayload(cursor);

  if (payload.v !== AI_THREAD_CURSOR_VERSION) {
    throw createInvalidCursorException('游标版本已失效，请重新从第一页加载');
  }
  if (payload.f !== expectedFilter) {
    throw createInvalidCursorException(
      '游标与当前筛选条件不匹配，切换筛选后需要重新从第一页加载',
    );
  }

  const updatedAt = new Date(payload.t);
  if (Number.isNaN(updatedAt.getTime())) {
    throw createInvalidCursorException('游标内容无法解析');
  }

  return { updatedAt, id: payload.i };
}

/** 把 base64url 游标还原为结构完整的负载，任何一步不符即视为非法游标。 */
function parseCursorPayload(cursor: string): AiThreadCursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
  } catch {
    throw createInvalidCursorException('游标内容无法解析');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw createInvalidCursorException('游标内容无法解析');
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate['v'] !== 'number' ||
    typeof candidate['f'] !== 'string' ||
    typeof candidate['t'] !== 'string' ||
    typeof candidate['i'] !== 'string' ||
    candidate['i'].length === 0
  ) {
    throw createInvalidCursorException('游标内容无法解析');
  }

  return {
    v: candidate['v'],
    f: candidate['f'] as AiThreadListFilter,
    t: candidate['t'],
    i: candidate['i'],
  };
}

/** 创建游标非法的稳定业务异常。 */
function createInvalidCursorException(message: string): BusinessException {
  return new BusinessException({
    code: API_ERROR_CODES.AI_THREAD_CURSOR_INVALID,
    message,
    status: HttpStatus.BAD_REQUEST,
  });
}
