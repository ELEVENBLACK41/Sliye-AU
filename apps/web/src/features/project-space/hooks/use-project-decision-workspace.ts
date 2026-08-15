/**
 * 本文件管理新版项目空间决策工作台的选择、按需读取和局部刷新状态。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DecisionDetail, DecisionSummary } from '@workspace/contracts/decisions';

import { getProjectSpaceDecisionWorkspace } from '../services/project-space-client.service';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';

/** 决策工作台 Hook 的输入属性。 */
type UseProjectDecisionWorkspaceOptions = {
  /** 服务端首屏返回的当前项目决策摘要。 */
  initialDecisions: DecisionSummary[];
  /** 查询参数中希望选中的决策主键。 */
  requestedDecisionId?: number;
};

/** 管理新版项目空间当前选中决策及其完整业务数据。 */
export function useProjectDecisionWorkspace({
  initialDecisions,
  requestedDecisionId,
}: UseProjectDecisionWorkspaceOptions) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const selectedDecisionId =
    requestedDecisionId && decisions.some((decision) => decision.id === requestedDecisionId)
      ? requestedDecisionId
      : decisions[0]?.id ?? null;
  const [workspaceData, setWorkspaceData] = useState<ProjectDecisionWorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(initialDecisions.length > 0);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  /** 重新读取当前选中决策的完整工作台数据。 */
  const refresh = useCallback((): void => {
    if (!selectedDecisionId) return;
    setWorkspaceData(null);
    setIsLoading(true);
    setError('');
    setReloadVersion((version) => version + 1);
  }, [selectedDecisionId]);

  /** 将新创建的决策加入本地列表并直接切换到该决策。 */
  const addDecision = useCallback((decision: DecisionDetail): void => {
    setDecisions((current) => [decision, ...current.filter((item) => item.id !== decision.id)]);
    setWorkspaceData(null);
    setIsLoading(true);
    setError('');
  }, []);

  /** 决策选择或刷新版本变化时并行读取工作台完整数据。 */
  useEffect(() => {
    if (!selectedDecisionId) return;

    let isCurrent = true;
    void getProjectSpaceDecisionWorkspace(selectedDecisionId)
      .then((data) => {
        if (!isCurrent) return;
        setWorkspaceData(data);
        setError('');
        setDecisions((current) => current.map((item) => (item.id === data.decision.id ? data.decision : item)));
      })
      .catch((caught: unknown) => {
        if (!isCurrent) return;
        setWorkspaceData(null);
        setError(caught instanceof Error ? caught.message : '决策数据加载失败');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [reloadVersion, selectedDecisionId]);

  return {
    decisions,
    selectedDecisionId,
    workspaceData,
    isLoading:
      isLoading ||
      (selectedDecisionId !== null && workspaceData?.decision.id !== selectedDecisionId),
    error,
    addDecision,
    refresh,
  };
}
