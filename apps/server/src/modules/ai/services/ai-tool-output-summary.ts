/**
 * 本文件定义工具窄输出落库摘要的截断约定。
 *
 * 编排层在结果过大时只保存截断标记，因此“已持久化的摘要”并不总是等于
 * 当初交回模型的真实输出。重放路径必须能判断这一点，否则会把截断标记
 * 当成成功结果交回模型。约定集中在这里，避免写入方和重放方各写一份。
 */

import type { Prisma } from '../../../generated/prisma';

/** 工具窄输出摘要允许写入数据库的最大 JSON 长度，超出时只保留截断标记。 */
export const MAX_TOOL_OUTPUT_SUMMARY_LENGTH = 16_000;

/** 把窄输出转换为可落库的受控摘要；异常大的结果只保留截断标记。 */
export function toAiToolOutputSummary(output: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(output ?? null);
  if (serialized.length <= MAX_TOOL_OUTPUT_SUMMARY_LENGTH) {
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  return { truncated: true, length: serialized.length };
}

/** 判断已持久化的摘要是否只是截断标记，从而不能作为工具结果重放。 */
export function isTruncatedAiToolOutputSummary(summary: unknown): boolean {
  return (
    typeof summary === 'object' &&
    summary !== null &&
    !Array.isArray(summary) &&
    (summary as Record<string, unknown>).truncated === true
  );
}
