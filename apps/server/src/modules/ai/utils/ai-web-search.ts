/**
 * 本文件把 Gateway 网页检索结果收敛为可持久化、可公开展示的来源摘要。
 */

import type { AiMessageWebSource } from '@workspace/contracts/ai';
import type { Prisma } from '../../../generated/prisma';

/** 从 Gateway 原始结果提取网页标题与地址，不持久化网页正文。 */
export function toAiWebSearchOutputSummary(
  output: unknown,
): Prisma.InputJsonValue {
  if (!isRecord(output) || !Array.isArray(output.results)) {
    return { webSources: [] };
  }

  return {
    webSources: output.results
      .flatMap((result) => toWebSource(result))
      .slice(0, 5),
  };
}

/** 从已持久化的网页检索摘要恢复消息接口需要的来源列表。 */
export function toAiWebSourcesFromSummary(
  summary: unknown,
): AiMessageWebSource[] {
  if (!isRecord(summary) || !Array.isArray(summary.webSources)) {
    return [];
  }

  return summary.webSources.flatMap((source) => toWebSource(source));
}

/** 把未知来源值收窄为允许展示的 HTTP(S) 网页来源。 */
function toWebSource(value: unknown): AiMessageWebSource[] {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    !/^https?:\/\//u.test(value.url) ||
    typeof value.title !== 'string' ||
    value.title.length === 0
  ) {
    return [];
  }

  return [{ url: value.url, title: value.title }];
}

/** 判断未知值是否为可按字段读取的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
