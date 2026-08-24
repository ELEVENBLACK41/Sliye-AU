/**
 * 本文件定义 getDecisionContext 暴露给模型的输入 Schema。
 * 模型只能选择决策主键，NestJS 会校验其属于当前 Run 已确认范围。
 */

import { z } from 'zod';

/** 模型从当前 Run 已确认的一个或多个 Decision 中选择本次读取目标。 */
export const getDecisionContextModelInputSchema = z
  .object({
    decisionId: z.number().int().positive(),
  })
  .strict();
