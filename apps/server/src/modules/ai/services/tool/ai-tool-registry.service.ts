/**
 * 本文件提供 Agent Runtime 的中心只读工具注册表。
 * 当前只校验和查询描述，不执行任何工具、模型或业务数据访问。
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  AiRuntimeToolGovernance,
  AiRuntimeToolPresentation,
  AiRuntimeToolResultLimit,
  AiRuntimeToolRetryPolicy,
} from '@workspace/contracts/ai';
import {
  AI_TOOL_DESCRIPTORS,
  AI_TOOL_VALUE_TYPES,
  type AiToolDataContract,
  type AiToolDescriptor,
  type AiToolDiscoveryRequirement,
  type AiToolFieldDescriptor,
} from '../../types/ai-tool-registry.types';
import { AI_TOOL_SOURCE_TYPES } from '../../types/ai-tool-source.types';

/** 稳定工具名称必须使用 lowerCamelCase，避免模型、审计与持久化记录出现多个别名。 */
const AI_TOOL_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;

/** 用于校验运行时配置的合法工具字段值类型集合。 */
const AI_TOOL_VALUE_TYPE_SET = new Set<string>(AI_TOOL_VALUE_TYPES);

/** 当前只读工具允许使用的风险等级；L3 为未来写操作预留。 */
const AI_READ_TOOL_RISK_LEVELS = new Set(['L0', 'L1', 'L2']);

/** 当前注册表允许的并行策略。 */
const AI_TOOL_PARALLEL_POLICIES = new Set(['ALLOW', 'DENY']);

/** 当前已经支持来源登记的业务来源类型。 */
const AI_TOOL_SOURCE_TYPE_SET = new Set<string>(AI_TOOL_SOURCE_TYPES);

@Injectable()
export class AiToolRegistryService {
  /** 按稳定名称保存的不可变工具描述，禁止由调用方在运行中修改。 */
  private readonly descriptorsByName: ReadonlyMap<string, AiToolDescriptor>;

  /** 注入模块级工具描述并在启动阶段一次性校验，避免模型看到不完整或重复的工具目录。 */
  constructor(
    @Inject(AI_TOOL_DESCRIPTORS)
    descriptors: readonly AiToolDescriptor[],
  ) {
    this.descriptorsByName = this.createDescriptorMap(descriptors);
  }

  /** 返回所有已批准工具的不可变描述快照，供后续 Runtime 构造工具调用能力。 */
  listDescriptors(): readonly AiToolDescriptor[] {
    return [...this.descriptorsByName.values()];
  }

  /** 通过稳定名称查询已批准工具；未注册名称返回 null，调用方不得自行降级为自由查询。 */
  findDescriptor(name: string): AiToolDescriptor | null {
    return this.descriptorsByName.get(name) ?? null;
  }

  /** 校验描述并建立按名称查询的不可变 Map，重复名称会在 NestJS 启动时立即失败。 */
  private createDescriptorMap(
    descriptors: readonly AiToolDescriptor[],
  ): ReadonlyMap<string, AiToolDescriptor> {
    const descriptorMap = new Map<string, AiToolDescriptor>();
    for (const descriptor of descriptors) {
      this.assertDescriptor(descriptor);
      if (descriptorMap.has(descriptor.name)) {
        throw new Error(`AI 工具名称重复：${descriptor.name}`);
      }
      descriptorMap.set(
        descriptor.name,
        this.createImmutableDescriptor(descriptor),
      );
    }

    return descriptorMap;
  }

  /** 校验工具描述不包含写能力、空字段、非法名称或无效超时。 */
  private assertDescriptor(descriptor: AiToolDescriptor): void {
    if (!AI_TOOL_NAME_PATTERN.test(descriptor.name)) {
      throw new Error(`AI 工具名称必须为 lowerCamelCase：${descriptor.name}`);
    }
    if (descriptor.description.trim().length === 0) {
      throw new Error(`AI 工具说明不能为空：${descriptor.name}`);
    }
    if (descriptor.accessMode !== 'READ') {
      throw new Error(`第二阶段只允许注册只读 AI 工具：${descriptor.name}`);
    }
    if (
      !Number.isSafeInteger(descriptor.timeoutMs) ||
      descriptor.timeoutMs <= 0
    ) {
      throw new Error(`AI 工具超时必须为正整数：${descriptor.name}`);
    }

    this.assertGovernance(descriptor);
    this.assertDataContract(descriptor.name, '输入', descriptor.input);
    this.assertDataContract(descriptor.name, '输出', descriptor.output);
    this.assertDiscoveryRequirement(descriptor);
  }

  /** 校验工具展示名称和来源、预算、重试及并行治理元数据。 */
  private assertGovernance(descriptor: AiToolDescriptor): void {
    const presentation = descriptor.presentation;
    if (!presentation || presentation.displayName.trim().length === 0) {
      throw new Error(`AI 工具展示名称不能为空：${descriptor.name}`);
    }

    const governance = descriptor.governance;
    if (!governance) {
      throw new Error(`AI 工具治理元数据缺失：${descriptor.name}`);
    }
    if (!AI_READ_TOOL_RISK_LEVELS.has(governance.riskLevel)) {
      throw new Error(`只读 AI 工具风险等级非法：${descriptor.name}`);
    }

    this.assertSourceTypes(descriptor.name, governance.sourceTypes);
    this.assertResultLimit(descriptor.name, governance.resultLimit);
    this.assertRetryPolicy(descriptor.name, governance.retryPolicy);

    if (!AI_TOOL_PARALLEL_POLICIES.has(governance.parallelPolicy)) {
      throw new Error(`AI 工具并行策略非法：${descriptor.name}`);
    }
  }

  /** 校验工具声明的来源类型都属于当前已经支持实时可见性判定的集合。 */
  private assertSourceTypes(
    toolName: string,
    sourceTypes: readonly string[],
  ): void {
    if (sourceTypes.length === 0) {
      throw new Error(`AI 工具来源类型不能为空：${toolName}`);
    }
    for (const sourceType of sourceTypes) {
      if (!AI_TOOL_SOURCE_TYPE_SET.has(sourceType)) {
        throw new Error(`AI 工具来源类型非法：${toolName}.${sourceType}`);
      }
    }
  }

  /** 校验工具至少声明一个正数结果上限，并拒绝非安全整数。 */
  private assertResultLimit(
    toolName: string,
    resultLimit: AiRuntimeToolResultLimit,
  ): void {
    const { maxItems, maxChars } = resultLimit;
    if (maxItems === undefined && maxChars === undefined) {
      throw new Error(`AI 工具结果上限不能为空：${toolName}`);
    }
    if (
      maxItems !== undefined &&
      (!Number.isSafeInteger(maxItems) || maxItems <= 0)
    ) {
      throw new Error(`AI 工具最大条数必须为正整数：${toolName}`);
    }
    if (
      maxChars !== undefined &&
      (!Number.isSafeInteger(maxChars) || maxChars <= 0)
    ) {
      throw new Error(`AI 工具最大字符数必须为正整数：${toolName}`);
    }
  }

  /** 校验自动重试次数为非负安全整数，允许明确声明不自动重试。 */
  private assertRetryPolicy(
    toolName: string,
    retryPolicy: AiRuntimeToolRetryPolicy,
  ): void {
    if (
      !Number.isSafeInteger(retryPolicy.maxRetries) ||
      retryPolicy.maxRetries < 0
    ) {
      throw new Error(`AI 工具最大重试次数必须为非负整数：${toolName}`);
    }
  }

  /** 校验前置发现声明指向的字段真实存在，避免编排层拿到无法执行的规则。 */
  private assertDiscoveryRequirement(descriptor: AiToolDescriptor): void {
    const requirement = descriptor.discoveryRequirement;
    if (!requirement) {
      return;
    }
    if (!AI_TOOL_NAME_PATTERN.test(requirement.discoveryToolName)) {
      throw new Error(`AI 工具前置发现工具名称非法：${descriptor.name}`);
    }
    if (requirement.discoveryToolName === descriptor.name) {
      throw new Error(
        `AI 工具不能把自己声明为前置发现工具：${descriptor.name}`,
      );
    }
    if (
      !descriptor.input.fields.some(
        (field) => field.name === requirement.targetInputField,
      )
    ) {
      throw new Error(
        `AI 工具前置发现声明的目标字段未在输入中定义：${descriptor.name}.${requirement.targetInputField}`,
      );
    }
    if (
      requirement.candidateListField.trim().length === 0 ||
      requirement.candidateIdentifierField.trim().length === 0
    ) {
      throw new Error(
        `AI 工具前置发现声明的候选字段不能为空：${descriptor.name}`,
      );
    }
  }

  /** 校验工具输入或输出字段都已显式声明且没有重复字段名。 */
  private assertDataContract(
    toolName: string,
    contractLabel: string,
    contract: AiToolDataContract,
  ): void {
    if (contract.description.trim().length === 0) {
      throw new Error(`AI 工具${contractLabel}说明不能为空：${toolName}`);
    }

    const fieldNames = new Set<string>();
    for (const field of contract.fields) {
      this.assertFieldDescriptor(toolName, contractLabel, field, fieldNames);
    }
  }

  /** 校验单个字段的名称、说明和值类型，避免模型获得未定义或模糊的参数。 */
  private assertFieldDescriptor(
    toolName: string,
    contractLabel: string,
    field: AiToolFieldDescriptor,
    fieldNames: Set<string>,
  ): void {
    if (!AI_TOOL_NAME_PATTERN.test(field.name)) {
      throw new Error(
        `AI 工具${contractLabel}字段名称非法：${toolName}.${field.name}`,
      );
    }
    if (field.description.trim().length === 0) {
      throw new Error(
        `AI 工具${contractLabel}字段说明不能为空：${toolName}.${field.name}`,
      );
    }
    if (!AI_TOOL_VALUE_TYPE_SET.has(field.valueType)) {
      throw new Error(
        `AI 工具${contractLabel}字段类型非法：${toolName}.${field.name}`,
      );
    }
    if (fieldNames.has(field.name)) {
      throw new Error(
        `AI 工具${contractLabel}字段重复：${toolName}.${field.name}`,
      );
    }
    fieldNames.add(field.name);
  }

  /** 深拷贝并冻结描述，防止模块外修改原始数组后悄悄改变 Runtime 可用工具。 */
  private createImmutableDescriptor(
    descriptor: AiToolDescriptor,
  ): AiToolDescriptor {
    return Object.freeze({
      ...descriptor,
      ...(descriptor.presentation
        ? {
            presentation: this.createImmutablePresentation(
              descriptor.presentation,
            ),
          }
        : {}),
      ...(descriptor.governance
        ? { governance: this.createImmutableGovernance(descriptor.governance) }
        : {}),
      input: this.createImmutableDataContract(descriptor.input),
      output: this.createImmutableDataContract(descriptor.output),
      ...(descriptor.discoveryRequirement
        ? {
            discoveryRequirement: this.createImmutableDiscoveryRequirement(
              descriptor.discoveryRequirement,
            ),
          }
        : {}),
    });
  }

  /** 深拷贝并冻结工作台展示元数据，避免外部改写工具名称。 */
  private createImmutablePresentation(
    presentation: AiRuntimeToolPresentation,
  ): AiRuntimeToolPresentation {
    return Object.freeze({ ...presentation });
  }

  /** 深拷贝并冻结治理元数据，保证已注册工具的策略快照不可变。 */
  private createImmutableGovernance(
    governance: AiRuntimeToolGovernance,
  ): AiRuntimeToolGovernance {
    return Object.freeze({
      ...governance,
      sourceTypes: Object.freeze([...governance.sourceTypes]),
      resultLimit: Object.freeze({ ...governance.resultLimit }),
      retryPolicy: Object.freeze({ ...governance.retryPolicy }),
    });
  }

  /** 深拷贝并冻结前置发现声明，避免模块外修改后绕过串联规则。 */
  private createImmutableDiscoveryRequirement(
    requirement: AiToolDiscoveryRequirement,
  ): AiToolDiscoveryRequirement {
    return Object.freeze({ ...requirement });
  }

  /** 深拷贝并冻结一个输入或输出数据契约。 */
  private createImmutableDataContract(
    contract: AiToolDataContract,
  ): AiToolDataContract {
    return Object.freeze({
      ...contract,
      fields: Object.freeze(
        contract.fields.map((field) => Object.freeze({ ...field })),
      ),
    });
  }
}
