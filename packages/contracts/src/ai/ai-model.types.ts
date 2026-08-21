/**
 * 本文件定义 AI 模型治理在 Web、NestJS 与后续运行记录之间共享的逻辑角色。
 * 角色只表达业务用途，不暴露具体供应商或模型 ID。
 */

/** AI 模型治理支持的全部逻辑角色。 */
export type AiModelRole = 'router' | 'standard' | 'deepReview' | 'embedding' | 'reranker';

/** 由语言模型承担的生成角色。 */
export type AiLanguageModelRole = 'standard' | 'deepReview';

/** 当前由确定性规则承担、不会产生模型费用的路由角色。 */
export type AiDeterministicModelRole = 'router';

/** 由向量模型承担的嵌入角色。 */
export type AiEmbeddingModelRole = 'embedding';

/** 由重排模型承担的候选排序角色。 */
export type AiRerankingModelRole = 'reranker';
