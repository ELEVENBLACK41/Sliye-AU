/**
 * 本文件验证中心工具注册表只接受完整、唯一且只读的工具描述。
 * 不注册实际工具实现，不访问数据库，也不调用模型。
 */

import type { AiToolDescriptor } from '../types/ai-tool-registry.types';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** 创建一项仅供注册表测试使用的完整只读工具描述。 */
function createToolDescriptor(
  overrides: Partial<AiToolDescriptor> = {},
): AiToolDescriptor {
  return {
    name: 'findDecisionCandidates',
    description: '按用户可见范围查找可能匹配的决策，不读取决策详情。',
    accessMode: 'READ',
    timeoutMs: 3_000,
    input: {
      description: '用户消息中提取的决策名称、别名或可见标识符。',
      fields: [
        {
          name: 'query',
          valueType: 'STRING',
          required: true,
          description: '待发现的决策名称、别名或可见标识符。',
        },
      ],
    },
    output: {
      description: '受当前用户权限过滤后的候选决策摘要。',
      fields: [
        {
          name: 'candidates',
          valueType: 'OBJECT',
          required: true,
          description: '受控数量的候选决策摘要集合。',
        },
      ],
    },
    ...overrides,
  };
}

describe('AiToolRegistryService', () => {
  it('返回已批准工具的只读描述，并且不暴露未注册名称', () => {
    const descriptor = createToolDescriptor();
    const service = new AiToolRegistryService([descriptor]);

    expect(service.listDescriptors()).toEqual([descriptor]);
    expect(service.findDescriptor('findDecisionCandidates')).toEqual(
      descriptor,
    );
    expect(service.findDescriptor('getDecisionContext')).toBeNull();
  });

  it('复制并冻结描述，阻止模块外修改原始对象改变已注册工具', () => {
    const descriptor = createToolDescriptor();
    const service = new AiToolRegistryService([descriptor]);
    descriptor.description = '被测试代码修改的错误说明。';
    descriptor.input.fields[0].description = '被测试代码修改的错误字段说明。';

    expect(service.findDescriptor(descriptor.name)).toMatchObject({
      description: '按用户可见范围查找可能匹配的决策，不读取决策详情。',
      input: {
        fields: [
          {
            description: '待发现的决策名称、别名或可见标识符。',
          },
        ],
      },
    });
  });

  it('拒绝重复名称、写能力和不完整字段描述', () => {
    expect(
      () =>
        new AiToolRegistryService([
          createToolDescriptor(),
          createToolDescriptor(),
        ]),
    ).toThrow('AI 工具名称重复');
    expect(
      () =>
        new AiToolRegistryService([
          createToolDescriptor({ accessMode: 'WRITE' as never }),
        ]),
    ).toThrow('第二阶段只允许注册只读 AI 工具');
    expect(
      () =>
        new AiToolRegistryService([
          createToolDescriptor({
            input: {
              description: '缺少字段说明的输入。',
              fields: [
                {
                  name: 'query',
                  valueType: 'STRING',
                  required: true,
                  description: '',
                },
              ],
            },
          }),
        ]),
    ).toThrow('AI 工具输入字段说明不能为空');
  });

  it('接受声明前置发现依赖的工具描述，并同样冻结该声明', () => {
    const descriptor = createToolDescriptor({
      name: 'getDecisionContext',
      input: {
        description: '本 Run 已发现候选中唯一命中的决策主键。',
        fields: [
          {
            name: 'decisionId',
            valueType: 'NUMBER',
            required: true,
            description: '待读取的决策主键。',
          },
        ],
      },
      discoveryRequirement: {
        discoveryToolName: 'findDecisionCandidates',
        targetInputField: 'decisionId',
        candidateListField: 'candidates',
        candidateIdentifierField: 'decisionId',
      },
    });
    const service = new AiToolRegistryService([descriptor]);
    const registered = service.findDescriptor('getDecisionContext');

    expect(registered?.discoveryRequirement).toEqual({
      discoveryToolName: 'findDecisionCandidates',
      targetInputField: 'decisionId',
      candidateListField: 'candidates',
      candidateIdentifierField: 'decisionId',
    });
    expect(Object.isFrozen(registered?.discoveryRequirement)).toBe(true);
  });

  it('拒绝指向未定义输入字段或指向自身的前置发现声明', () => {
    expect(
      () =>
        new AiToolRegistryService([
          createToolDescriptor({
            // 输入里只声明了 query，因此指向 decisionId 的前置发现声明必须被拒绝。
            name: 'getDecisionContext',
            discoveryRequirement: {
              discoveryToolName: 'findDecisionCandidates',
              targetInputField: 'decisionId',
              candidateListField: 'candidates',
              candidateIdentifierField: 'decisionId',
            },
          }),
        ]),
    ).toThrow('AI 工具前置发现声明的目标字段未在输入中定义');
    expect(
      () =>
        new AiToolRegistryService([
          createToolDescriptor({
            discoveryRequirement: {
              discoveryToolName: 'findDecisionCandidates',
              targetInputField: 'query',
              candidateListField: 'candidates',
              candidateIdentifierField: 'decisionId',
            },
          }),
        ]),
    ).toThrow('AI 工具不能把自己声明为前置发现工具');
  });
});
