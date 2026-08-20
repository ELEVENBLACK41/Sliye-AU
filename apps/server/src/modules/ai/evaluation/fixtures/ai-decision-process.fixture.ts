/**
 * 本文件聚合第 0 阶段全部脱敏决策过程案例，
 * 为 50 条 Gold Query 和三层确定性评测提供统一 Fixture 版本。
 */
import { AI_MEETING_CADENCE_CASE_V1 } from './decision-process/meeting-cadence-case.fixture';
import { AI_OFFICE_RENEWAL_CASE_V1 } from './decision-process/office-renewal-case.fixture';
import { AI_VENDOR_SELECTION_CASE_V1 } from './decision-process/vendor-selection-case.fixture';
import type { AiDecisionProcessFixtureV1 } from '../types/ai-decision-process-fixture.types';

/** 第 0 阶段完整决策过程 Fixture V1。 */
export const AI_DECISION_PROCESS_FIXTURE_V1 = {
  fixtureVersion: 'ai-decision-process-fixture-v1',
  cases: [
    AI_VENDOR_SELECTION_CASE_V1,
    AI_MEETING_CADENCE_CASE_V1,
    AI_OFFICE_RENEWAL_CASE_V1,
  ],
} as const satisfies AiDecisionProcessFixtureV1;
