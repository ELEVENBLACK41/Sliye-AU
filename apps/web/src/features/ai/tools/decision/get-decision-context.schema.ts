/**
 * 本文件定义 getDecisionContext 暴露给模型的空输入 Schema，决策范围只允许由服务端 Thread 上下文提供。
 */

import { z } from 'zod';

/** 模型不能选择或覆盖当前 Thread 已经绑定的 Decision。 */
export const getDecisionContextModelInputSchema = z.object({}).strict();
