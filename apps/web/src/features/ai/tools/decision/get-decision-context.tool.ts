/**
 * 本文件实现唯一真实只读工具 getDecisionContext，经 NestJS 重新鉴权后读取决策上下文。
 */
import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';

import { getAiDecisionContext } from '../../runtime/ai-nest-client.server';
import { getDecisionContextModelInputSchema } from './get-decision-context.schema';

/** 工具 scoped context，只包含本次调用真正需要的服务端字段。 */
export const getDecisionContextToolContextSchema = z.object({
  userId: z.number().int().positive(),
  accessToken: z.string().min(1),
  runId: z.string().uuid(),
  executionLeaseId: z.string().uuid(),
  decisionId: z.number().int().positive(),
});

/** getDecisionContext 的服务端工具定义。 */
export const getDecisionContextTool = tool({
  description:
    '读取当前 AI Thread 绑定决策的标题、状态、所属项目/区域、责任部门和参与人数。回答任何决策基础事实前必须先调用；不要用它查询提案、投票、决议正文或讨论消息。',
  inputSchema: getDecisionContextModelInputSchema,
  contextSchema: getDecisionContextToolContextSchema,
  execute: async (_input, { context }) => {
    return getAiDecisionContext(
      { userId: context.userId, accessToken: context.accessToken },
      context.runId,
      context.executionLeaseId,
      context.decisionId,
    );
  },
});
