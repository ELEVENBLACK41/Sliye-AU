/**
 * 本文件负责为一次 Run 构造受限的对话上下文。
 * 第二阶段只做基础预算：按条数取最近若干条已分发用户消息与已生成助手消息，
 * 逐条截断过长正文，并对总长度设上限，超出时优先丢弃最旧的消息。
 * 完整历史仍然保存在数据库中，由会话历史接口分页查看，不受本预算影响。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiMessageDispatchState,
  AiMessageRole,
} from '../../../generated/prisma';

/** 注入模型的历史消息条数上限。 */
const MAX_CONTEXT_MESSAGES = 12;

/** 单条历史消息进入模型上下文前的最大字符数。 */
const MAX_MESSAGE_CHARACTERS = 2_000;

/** 全部历史消息合计允许的最大字符数。 */
const MAX_TOTAL_CHARACTERS = 16_000;

/** 一条可注入模型上下文的历史消息。 */
export type AiContextMessage = {
  /** 消息发送方角色。 */
  role: 'USER' | 'ASSISTANT';
  /** 已按预算截断的消息正文。 */
  content: string;
};

@Injectable()
export class AiContextBudgetService {
  /** 注入唯一 Prisma 服务；上下文只读取已持久化消息，不访问业务数据。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 读取当前 Thread 的受限历史消息，按时间正序返回。
   * 排队中、已被替代的用户输入和当前 Run 自己的消息都不进入上下文，
   * 避免把尚未执行或已经作废的输入当作历史对话。
   */
  async buildRecentMessages(input: {
    /** 消息所属 Thread 标识。 */
    threadId: string;
    /** 当前 Run 正在回答的用户消息标识，作为本次请求单独传入模型。 */
    currentUserMessageId: string;
  }): Promise<AiContextMessage[]> {
    const messages = await this.prisma.aiMessage.findMany({
      where: {
        threadId: input.threadId,
        id: { not: input.currentUserMessageId },
        OR: [
          {
            role: AiMessageRole.USER,
            dispatchState: AiMessageDispatchState.DISPATCHED,
          },
          { role: AiMessageRole.ASSISTANT, NOT: { content: '' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });

    return this.applyTotalBudget(
      messages
        .reverse()
        .map((message) => ({
          role:
            message.role === AiMessageRole.USER
              ? ('USER' as const)
              : ('ASSISTANT' as const),
          content: this.truncate(message.content),
        })),
    );
  }

  /** 截断单条过长消息，保留开头内容并显式标记已截断。 */
  private truncate(content: string): string {
    return content.length <= MAX_MESSAGE_CHARACTERS
      ? content
      : `${content.slice(0, MAX_MESSAGE_CHARACTERS)}…（历史消息已截断）`;
  }

  /** 从最旧的消息开始丢弃，直到合计长度不超过总预算。 */
  private applyTotalBudget(messages: AiContextMessage[]): AiContextMessage[] {
    let totalCharacters = messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    let firstKeptIndex = 0;
    while (
      totalCharacters > MAX_TOTAL_CHARACTERS &&
      firstKeptIndex < messages.length
    ) {
      totalCharacters -= messages[firstKeptIndex].content.length;
      firstKeptIndex += 1;
    }

    return messages.slice(firstKeptIndex);
  }
}
