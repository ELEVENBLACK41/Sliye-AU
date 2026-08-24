/**
 * 本文件实现受 `ai:chat:use` 保护的 AI SDK 流式对话接口。
 * 成功流保持 AI UI Message 协议，鉴权和参数失败使用统一 JSON 错误契约。
 */
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { apiError } from '@/app/api/_utils/response';
import { normalizeAiModelError } from '@/features/ai/runtime/ai-model-error';
import { resolveAiLanguageModel } from '@/features/ai/runtime/ai-model.server';
import {
  logAiLanguageModelCallEnd,
  logAiModelAbort,
  logAiModelStreamError,
} from '@/features/ai/runtime/ai-model-telemetry.server';
import { hasSystemPermission } from '@/features/auth/services/auth-server.service';
import { getAuthenticatedRouteUser } from '@/server/bff/authenticated-nest-proxy';

/** AI 对话请求体运行时校验规则。 */
const chatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
});

/** 当前 AI 测试机器人的联调规则，确保全量工具展示可被稳定触发。 */
const AI_TEST_ASSISTANT_INSTRUCTIONS = `
你是 NextNest 的决策协作测试助手。所有工具返回均为 MOCK 数据，必须在最终回答中明确说明这一点。

当用户输入“运行完整模拟工具链”时：
1. 不要先输出解释文本。
2. 必须在同一轮工具调用中调用以下全部五个工具：getProjectSnapshot、listActiveDecisions、getDecisionTimeline、compareDecisionProposals、getMeetingSummary。
3. 使用这些固定参数：projectName 为“NextNest”，decisionTitle 为“确定 AI 助手首个交付闭环”，proposalTitles 为[“方案 A”, “方案 B”]，meetingTitle 为“AI 首版方案评审会”。
4. 等待所有工具返回后，再用中文简要汇总五项模拟结果。
`;

/** 等待指定时间，用于模拟外部工具的异步执行耗时。 */
function waitForMockToolResult(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/** 校验认证与权限后创建 AI SDK 流式响应。 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const currentUser = await getAuthenticatedRouteUser();

  if (!currentUser) {
    return apiError({
      status: 401,
      message: '登录状态已失效，请重新登录',
      path: '/api/chat',
      requestId,
    });
  }

  if (!hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.ai.chatUse)) {
    return apiError({
      status: 403,
      message: '当前账号没有使用 AI 对话的权限',
      path: '/api/chat',
      requestId,
    });
  }

  try {
    const parsed = chatRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError({
        status: 400,
        message: 'AI 对话消息格式不正确',
        path: '/api/chat',
        requestId,
      });
    }

    const resolvedModel = resolveAiLanguageModel('standard', {
      userId: currentUser.id,
      feature: 'chat',
    });
    const { configuration } = resolvedModel;
    const result = streamText({
      model: resolvedModel.model,
      system: AI_TEST_ASSISTANT_INSTRUCTIONS,
      messages: await convertToModelMessages(parsed.data.messages),
      abortSignal: request.signal,
      timeout: resolvedModel.timeout,
      maxOutputTokens: configuration.budget.maxOutputTokens,
      maxRetries: configuration.budget.maxRetries,
      providerOptions: resolvedModel.providerOptions,
      stopWhen: isStepCount(5),
      tools: {
        /** 查询项目当前协作状态的模拟快照，仅用于 AI 工具调用联调。 */
        getProjectSnapshot: tool({
          description: '获取指定项目的模拟协作快照，仅用于界面和工具调用联调，不能作为真实业务结论。',
          inputSchema: z.object({
            projectName: z.string().min(1).describe('需要查看的项目名称'),
          }),
          execute: async ({ projectName }) => {
            await waitForMockToolResult(2_000);

            return {
              source: 'MOCK',
              projectName,
              status: 'ACTIVE',
              memberCount: 8,
              openDecisionCount: 3,
              nextMeetingAt: '2026-08-28T10:00:00+08:00',
            };
          },
        }),
        /** 返回项目当前可推进决策的模拟列表，仅用于 AI 工具调用联调。 */
        listActiveDecisions: tool({
          description: '列出项目内模拟的活跃决策，帮助用户选择接下来要推进的事项。返回内容仅用于联调。',
          inputSchema: z.object({
            projectName: z.string().min(1).describe('需要查询的项目名称'),
          }),
          execute: async ({ projectName }) => {
            await waitForMockToolResult(3_000);

            return {
              source: 'MOCK',
              projectName,
              decisions: [
                { id: 'decision-101', title: '确认移动端首版信息架构', status: 'DISCUSSING', participantCount: 6 },
                { id: 'decision-102', title: '选择会议记录的存储策略', status: 'DRAFT', participantCount: 4 },
                { id: 'decision-103', title: '确定 AI 助手首个交付闭环', status: 'DISCUSSING', participantCount: 8 },
              ],
            };
          },
        }),
        /** 返回指定决策的模拟过程事件，方便验证回放类问答。 */
        getDecisionTimeline: tool({
          description: '获取某个决策如何形成的模拟时间线，供解释过程和生成回放草稿时使用。返回内容仅用于联调。',
          inputSchema: z.object({
            decisionTitle: z.string().min(1).describe('需要回看的决策标题'),
          }),
          execute: async ({ decisionTitle }) => {
            await waitForMockToolResult(4_000);

            return {
              source: 'MOCK',
              decisionTitle,
              events: [
                { occurredAt: '2026-08-20T09:30:00+08:00', type: 'DECISION_CREATED', summary: '负责人创建决策事项。' },
                {
                  occurredAt: '2026-08-21T14:00:00+08:00',
                  type: 'PROPOSAL_CREATED',
                  summary: '团队提交两个候选提案。',
                },
                { occurredAt: '2026-08-22T16:30:00+08:00', type: 'VOTE_ROUND_OPENED', summary: '发起单选投票。' },
              ],
            };
          },
        }),
        /** 对多个模拟提案进行维度化比较，供方案比较类提问调用。 */
        compareDecisionProposals: tool({
          description: '比较一项决策的候选提案，返回模拟的成本、风险和推荐方向；不代表真实评审结果。',
          inputSchema: z.object({
            decisionTitle: z.string().min(1).describe('提案所属的决策标题'),
            proposalTitles: z.array(z.string().min(1)).min(2).max(4).describe('需要比较的两个到四个提案标题'),
          }),
          execute: async ({ decisionTitle, proposalTitles }) => {
            await waitForMockToolResult(5_000);

            return {
              source: 'MOCK',
              decisionTitle,
              comparisons: proposalTitles.map((title, index) => ({
                title,
                deliveryCost: index === 0 ? '中' : '低',
                deliveryRisk: index === 0 ? '低' : '中',
                expectedImpact: index === 0 ? '高' : '中',
              })),
              recommendation: proposalTitles[0],
              recommendationReason: '模拟数据中该方案在预期影响和交付风险之间取得更平衡的结果。',
            };
          },
        }),
        /** 返回会议讨论纪要的模拟结果，供会议后续问答联调。 */
        getMeetingSummary: tool({
          description: '获取指定会议的模拟讨论纪要、待确认问题和关联决策；仅用于测试 AI 回答效果。',
          inputSchema: z.object({
            meetingTitle: z.string().min(1).describe('需要总结的会议标题'),
          }),
          execute: async ({ meetingTitle }) => {
            await waitForMockToolResult(6_000);

            return {
              source: 'MOCK',
              meetingTitle,
              participants: ['Sliye', '产品负责人', '前端负责人', '后端负责人'],
              keyPoints: ['确认当前范围止于正式决议形成。', '优先完成 AI 对话和决策过程说明的联调。'],
              openQuestions: ['是否需要在首版支持会议附件？'],
              linkedDecisionTitle: '确定 AI 助手首个交付闭环',
            };
          },
        }),
      },
      onLanguageModelCallEnd: (event) => {
        logAiLanguageModelCallEnd({
          requestId,
          role: configuration.role,
          configuredModelId: configuration.primary.modelId,
          event,
        });
      },
      onError: ({ error }) => {
        logAiModelStreamError(requestId, configuration.role, error);
      },
      onAbort: () => {
        logAiModelAbort(requestId, configuration.role);
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (error) => normalizeAiModelError(error).message,
      }),
    });
  } catch (error) {
    const normalized = normalizeAiModelError(error);
    logAiModelStreamError(requestId, 'standard', error);

    return apiError({
      status: normalized.status,
      code: normalized.code,
      message: normalized.message,
      path: '/api/chat',
      requestId,
    });
  }
}
