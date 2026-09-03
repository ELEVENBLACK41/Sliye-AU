/**
 * 本文件负责 AI 只读列表共用的不透明游标编解码。
 *
 * 各列表都按“时间倒序 + 标识兜底”做 keyset 分页：只用时间做游标会在同一时刻的
 * 多条记录之间产生重复项或漏项，因此游标同时承载排序时间和记录标识。
 *
 * 游标对客户端不透明：它只是分页位置，不是凭据。
 * 这里做的是**结构校验**而不是防篡改签名——数据范围由 SQL 中的所有者条件独立保证，
 * 伪造游标最多只能改变自己列表的起始位置，读不到任何他人数据，
 * 因此不需要 HMAC 之类的签名成本。
 *
 * 游标额外编码 `kind` 与 `scope` 并在解码时比对：
 * `kind` 区分不同列表，防止把会话列表游标传给消息列表；
 * `scope` 绑定该列表的查询前提（会话列表是归档筛选，消息列表是所属会话），
 * 换了前提还复用旧游标会得到与预期不同的结果集，这里统一定义为稳定错误，
 * 不静默降级为“从头开始”，避免客户端在翻页出错时无声地重复消费第一页。
 */

import { HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';

/** 当前游标编码版本；结构调整时递增，旧版本游标一律拒绝。 */
const AI_CURSOR_VERSION = 1;

/** 使用不透明游标的列表种类。 */
export const AI_CURSOR_KINDS = {
  /** 会话列表，scope 为归档筛选条件。 */
  THREAD_LIST: 'THREAD_LIST',
  /** 会话内消息列表，scope 为所属 Thread 标识。 */
  MESSAGE_LIST: 'MESSAGE_LIST',
} as const;

/** 列表种类取值。 */
export type AiCursorKind =
  (typeof AI_CURSOR_KINDS)[keyof typeof AI_CURSOR_KINDS];

/** 解码后的游标位置，对应 keyset 分页的上一条记录。 */
export type AiCursorPosition = {
  /** 上一页边界记录的排序时间。 */
  time: Date;
  /** 上一页边界记录的标识，用于同一时间戳内的稳定排序。 */
  id: string;
};

/** 游标内部的序列化结构；字段名保持简短以缩短游标长度。 */
type AiCursorPayload = {
  /** 编码版本。 */
  v: number;
  /** 列表种类。 */
  k: string;
  /** 该列表的查询前提。 */
  s: string;
  /** 排序时间的 ISO 8601 字符串。 */
  t: string;
  /** 记录标识。 */
  i: string;
};

/** 把一条记录的位置编码为不透明游标。 */
export function encodeAiCursor(input: {
  kind: AiCursorKind;
  scope: string;
  time: Date;
  id: string;
}): string {
  const payload: AiCursorPayload = {
    v: AI_CURSOR_VERSION,
    k: input.kind,
    s: input.scope,
    t: input.time.toISOString(),
    i: input.id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** 解码游标并校验它与本次请求的列表种类和查询前提一致。 */
export function decodeAiCursor(
  cursor: string,
  expected: { kind: AiCursorKind; scope: string },
): AiCursorPosition {
  const payload = parseCursorPayload(cursor);

  if (payload.v !== AI_CURSOR_VERSION) {
    throw createInvalidCursorException('游标版本已失效，请重新从第一页加载');
  }
  if (payload.k !== expected.kind) {
    throw createInvalidCursorException('游标不属于当前列表');
  }
  if (payload.s !== expected.scope) {
    throw createInvalidCursorException(
      '游标与当前查询条件不匹配，切换条件后需要重新从第一页加载',
    );
  }

  const time = new Date(payload.t);
  if (Number.isNaN(time.getTime())) {
    throw createInvalidCursorException('游标内容无法解析');
  }

  return { time, id: payload.i };
}

/** 把 base64url 游标还原为结构完整的负载，任何一步不符即视为非法游标。 */
function parseCursorPayload(cursor: string): AiCursorPayload {
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
    typeof candidate['k'] !== 'string' ||
    typeof candidate['s'] !== 'string' ||
    typeof candidate['t'] !== 'string' ||
    typeof candidate['i'] !== 'string' ||
    candidate['i'].length === 0
  ) {
    throw createInvalidCursorException('游标内容无法解析');
  }

  return {
    v: candidate['v'],
    k: candidate['k'],
    s: candidate['s'],
    t: candidate['t'],
    i: candidate['i'],
  };
}

/** 创建游标非法的稳定业务异常。 */
function createInvalidCursorException(message: string): BusinessException {
  return new BusinessException({
    code: API_ERROR_CODES.AI_CURSOR_INVALID,
    message,
    status: HttpStatus.BAD_REQUEST,
  });
}
