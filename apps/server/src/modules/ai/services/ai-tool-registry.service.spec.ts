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
});
