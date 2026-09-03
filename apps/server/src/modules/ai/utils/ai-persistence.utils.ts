/**
 * 本文件提供 AI 持久化服务共用的确定性指纹、标题和模型角色转换工具。
 */

import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { AiLanguageModelRole as PrismaAiLanguageModelRole } from '../../../generated/prisma';
import { BusinessException } from '../../../common/exceptions/business.exception';

/** 从客户端原始请求正文生成不可逆且可比较的 SHA-256 指纹。 */
export function createAiRequestFingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 为 JSON 兼容值生成与对象字段顺序无关的稳定 SHA-256 指纹。 */
export function createAiJsonFingerprint(value: unknown): string {
  return createAiRequestFingerprint(
    JSON.stringify(sortJsonValue(value)) ?? 'undefined',
  );
}

/** 递归排序对象键，数组顺序保持不变，供幂等请求比较语义相同的 JSON。 */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

/** 校验 AI 持久化入口所需的非空字符串，避免把无意义记录写入数据库。 */
export function assertAiRequiredText(value: string, field: string): void {
  if (value.trim().length > 0) {
    return;
  }

  throw new BusinessException({
    code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    message: `${field}不能为空`,
    status: HttpStatus.BAD_REQUEST,
  });
}

/** 从首条用户消息生成可用的默认 Thread 标题，不引入模型调用。 */
export function createAiThreadTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 48)}…`;
}

/** 将共享 contracts 的小写模型角色转换为 Prisma 持久化枚举。 */
export function toPrismaAiLanguageModelRole(
  role: AiLanguageModelRole,
): PrismaAiLanguageModelRole {
  return role === 'deepReview'
    ? PrismaAiLanguageModelRole.DEEP_REVIEW
    : PrismaAiLanguageModelRole.STANDARD;
}
