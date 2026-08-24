/**
 * 本文件通过 TypeScript 编译期断言验证 2.7 动态范围契约的关键互斥与非空约束。
 * 它不生成运行时代码，也不替代后续 NestJS 权限和数据库集成测试。
 */

import type {
  AiAuthorizedDecisionScope,
  AiAwaitingRunScopeConfirmation,
  AiHistoryContentVisibility,
  AiResolvedRunScope,
} from '../src/ai/ai-scope.types.ts';

/** 编译期布尔断言；传入 `false` 时 `tsc` 必须失败。 */
type Assert<Condition extends true> = Condition;

/** 已解析 Run 必须包含至少一个授权决策范围。 */
type ResolvedScopeMustBeNonEmpty = Assert<
  AiResolvedRunScope['scopes'] extends readonly [
    AiAuthorizedDecisionScope,
    ...AiAuthorizedDecisionScope[],
  ]
    ? true
    : false
>;

/** 等待确认状态必须包含至少一个已经完成权限过滤的候选。 */
type AwaitingCandidatesMustBeNonEmpty = Assert<
  AiAwaitingRunScopeConfirmation['candidates'] extends readonly [unknown, ...unknown[]]
    ? true
    : false
>;

/** 隐藏历史内容的浏览器契约不能包含失权来源标识。 */
type HiddenVisibilityMustNotExposeSourceIds = Assert<
  'sourceIds' extends keyof Extract<AiHistoryContentVisibility, { state: 'HIDDEN' }> ? false : true
>;

/** 可见历史内容不能携带隐藏原因。 */
type VisibleContentReasonMustBeNull = Assert<
  Extract<AiHistoryContentVisibility, { state: 'VISIBLE' }>['reason'] extends null ? true : false
>;

/** 汇总全部编译期断言，避免编辑器将单项结果误判为无关声明。 */
export type AiScopeContractTypeTests =
  | ResolvedScopeMustBeNonEmpty
  | AwaitingCandidatesMustBeNonEmpty
  | HiddenVisibilityMustNotExposeSourceIds
  | VisibleContentReasonMustBeNull;
