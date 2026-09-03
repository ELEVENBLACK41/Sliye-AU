/**
 * 本文件提供 AI 评测指标共用的确定性数学与来源定位函数，
 * 避免三层指标各自实现不同的舍入、百分位和引用比较规则。
 */
import type { AiGoldQueryForbiddenSourceReference } from '../types/ai-gold-query.types';

/** 将来源类型和主键转换为跨表稳定的比较键。 */
export function toSourceReferenceKey(
  reference: AiGoldQueryForbiddenSourceReference,
): string {
  return reference.sourceType + ':' + reference.sourceId;
}

/** 在分母为零时返回指定空集合结果，避免产生 NaN。 */
export function safeDivide(
  numerator: number,
  denominator: number,
  emptyValue = 1,
): number {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

/** 将指标统一舍入到四位小数，保证 JSON 和 Markdown 报告稳定。 */
export function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

/** 计算最近秩百分位，输入为空时返回 0。 */
export function calculatePercentile(
  values: readonly number[],
  percentile: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);

  return sortedValues[index] ?? 0;
}

/** 按来源比较键去重，保留首次出现的排序。 */
export function uniqueSourceReferences(
  references: readonly AiGoldQueryForbiddenSourceReference[],
): readonly AiGoldQueryForbiddenSourceReference[] {
  const seenKeys = new Set<string>();

  return references.filter((reference) => {
    const key = toSourceReferenceKey(reference);

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}
