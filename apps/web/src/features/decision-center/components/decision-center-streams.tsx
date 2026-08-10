/**
 * 本文件承接决策中心三个并行数据 Promise，让各业务区域独立流式呈现。
 */
import type {
  DecisionCenterActivityResponse,
  DecisionCenterAnalyticsResponse,
  DecisionCenterArchiveResponse,
} from '@workspace/contracts/decisions';

import { DecisionCenterActivity } from './decision-center-activity';
import { DecisionCenterAnalytics } from './decision-center-analytics';
import { DecisionCenterArchive } from './decision-center-archive';
import { DecisionCenterSectionError } from './decision-center-section-error';

/** 等待活动区数据并保持失败隔离。 */
export async function DecisionActivityStream({ data }: { data: Promise<DecisionCenterActivityResponse> }) {
  let activity: DecisionCenterActivityResponse;
  try {
    activity = await data;
  } catch {
    return <DecisionCenterSectionError title="决策活动" />;
  }
  return <DecisionCenterActivity activity={activity} />;
}

/** 等待过程分析数据并保持失败隔离。 */
export async function DecisionAnalyticsStream({ data }: { data: Promise<DecisionCenterAnalyticsResponse> }) {
  let analytics: DecisionCenterAnalyticsResponse;
  try {
    analytics = await data;
  } catch {
    return <DecisionCenterSectionError title="过程分析" />;
  }
  return <DecisionCenterAnalytics analytics={analytics} />;
}

/** 等待档案数据并保持失败隔离。 */
export async function DecisionArchiveStream({ data }: { data: Promise<DecisionCenterArchiveResponse> }) {
  let archive: DecisionCenterArchiveResponse;
  try {
    archive = await data;
  } catch {
    return <DecisionCenterSectionError title="决策档案" />;
  }
  return <DecisionCenterArchive archive={archive} />;
}
