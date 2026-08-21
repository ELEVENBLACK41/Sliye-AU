/**
 * 本文件验证 AI Runtime DTO 在全局白名单策略下正确接收并校验嵌套工具输入。
 */

import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartAiToolCallDto } from './ai-request.dto';

/** 使用与 main.ts 相同的白名单规则校验工具开始请求。 */
async function validateStartToolCall(payload: Record<string, unknown>) {
  return validate(plainToInstance(StartAiToolCallDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('StartAiToolCallDto', () => {
  it('应允许声明完整且有效的 getDecisionContext 嵌套输入', async () => {
    await expect(
      validateStartToolCall({
        executionLeaseId: randomUUID(),
        toolCallId: 'tool-call-1',
        sequence: 1,
        toolName: 'getDecisionContext',
        input: { decisionId: 4 },
      }),
    ).resolves.toHaveLength(0);
  });

  it('应拒绝无效决策主键和嵌套未声明字段', async () => {
    const errors = await validateStartToolCall({
      executionLeaseId: randomUUID(),
      toolCallId: 'tool-call-2',
      sequence: 1,
      toolName: 'getDecisionContext',
      input: { decisionId: 0, unexpected: true },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('input');
    expect(errors[0]?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'decisionId' }),
        expect.objectContaining({ property: 'unexpected' }),
      ]),
    );
  });
});
