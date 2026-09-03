# Decision Agent 第 0 阶段评测报告

> 本报告由脱敏 Fixture 和 AI SDK V4 Mock 模型确定性生成，不代表生产 RAG 效果。

## 版本信息

- 报告版本：ai-stage-zero-report-v1
- 固定生成时间：2026-08-20T00:00:00.000Z
- 执行模式：deterministic_mock
- Gold Query：ai-stage-zero-gold-query-v1
- Fixture：ai-decision-process-fixture-v1
- AI SDK：7.0.18
- 语言模型：mock-language-model-v4-stage-zero
- 向量模型：mock-embedding-model-v4-stage-zero

## Retriever

| 模式 | 配置版本 | Recall@5 | Recall@10 | Recall@20 | MRR | nDCG@20 | 权限泄漏 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| keyword | mock-ranked-fixture-v1 | 90.08% | 91.06% | 91.06% | 0.4756 | 0.6256 | 0 |
| vector | mock-ranked-fixture-v1 | 82.20% | 86.59% | 86.59% | 0.3008 | 0.4902 | 0 |
| hybrid | mock-ranked-fixture-v1 | 100.00% | 100.00% | 100.00% | 1.0000 | 1.0000 | 0 |

## Answer

| 指标 | 结果 |
| --- | ---: |
| 引用准确率 | 100.00% |
| 引用覆盖率 | 100.00% |
| 答案要点覆盖率 | 100.00% |
| 主要事实忠实度 | 100.00% |
| 无答案准确率 | 100.00% |
| 引用泄漏来源数 | 0 |
| 高风险无依据事实数 | 0 |

## System

| 指标 | 结果 |
| --- | ---: |
| 工具选择准确率 | 100.00% |
| 延迟 p50 | 116 ms |
| 延迟 p95 | 149 ms |
| 输入 Token | 600 |
| 输出 Token | 1200 |
| Mock 成本 | $0.0000 |
| 取消成功率 | 100.00% |
| 降级成功率 | 100.00% |

## 门禁

| 门禁 | 当前值 | 要求 | 结果 |
| --- | ---: | ---: | --- |
| 任何检索配置的越权来源数必须为 0。 | 0 | = 0 | 通过 |
| 引用不得指向禁止来源。 | 0 | = 0 | 通过 |
| 混合模拟检索 Recall@20 不低于 0.85。 | 1 | ≥ 0.85 | 通过 |
| 混合模拟检索相对最佳单路 Recall@20 至少提升 0.05。 | 0.0894 | ≥ 0.05 | 通过 |
| 主要结论引用覆盖率不低于 0.90。 | 1 | ≥ 0.9 | 通过 |
| 引用准确率不低于 0.95。 | 1 | ≥ 0.95 | 通过 |
| 无答案判断准确率不低于 0.90。 | 1 | ≥ 0.9 | 通过 |
| 高风险精确事实不允许无依据生成。 | 0 | = 0 | 通过 |
| Mock 系统工具选择准确率为 100%。 | 1 | ≥ 1 | 通过 |
| Mock 取消场景必须被确定性处理。 | 1 | ≥ 1 | 通过 |
| Mock 降级场景必须被确定性处理。 | 1 | ≥ 1 | 通过 |

## 失败样本

- [retriever] comparison-office-cost-commute：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] comparison-vendor-cost：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] exact-meeting-cadence-vote：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] exact-vendor-resolution-time：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] semantic-meeting-current-pain：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] timeline-vendor-meeting-to-decision：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] timeline-vendor-vote-to-resolution：keyword 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] adversarial-create-task-bypass：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] anonymous-vote-summary-only：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] comparison-meeting-frequency-duration：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] exact-office-resolution-time：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] exact-vendor-resolution-time：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] semantic-meeting-biweekly-rationale：vector 模拟基线未完整召回相关来源或触发了权限门禁。
- [retriever] timeline-office-concession-before-vote：vector 模拟基线未完整召回相关来源或触发了权限门禁。

## 说明

- 本报告只验证脱敏 Fixture、指标公式、权限门禁和 Mock 状态流，不代表生产 RAG 质量。
- 关键词、向量和混合排序均为可重复的模拟基线；接入真实检索后必须复用同一报告合同重新测量。
- AI SDK V4 MockLanguageModel 与 MockEmbeddingModel 均已实际调用，未访问真实模型或产生费用。
- 真实业务样本只能放入 Git 忽略的 fixtures/private 目录。
