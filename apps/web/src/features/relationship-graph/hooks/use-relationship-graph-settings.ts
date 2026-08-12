/**
 * 本文件在客户端管理新版个人关系图谱设置，并按当前用户隔离持久化到 localStorage。
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  RelationshipGraphSettings,
  RelationshipGraphSettingsPatch,
} from '../types/relationship-graph-settings.types';
import {
  createDefaultRelationshipGraphSettings,
  deserializeRelationshipGraphSettings,
  getRelationshipGraphSettingsStorageKey,
  mergeRelationshipGraphSettings,
  readRelationshipGraphSettings,
  writeRelationshipGraphSettings,
} from '../utils/relationship-graph-settings';

/** 关系图谱设置 Hook 返回的状态与操作。 */
export type UseRelationshipGraphSettingsResult = {
  /** 当前用户生效中的完整图谱设置。 */
  settings: RelationshipGraphSettings;
  /** 合并一组设置补丁，非法数值会保持原设置。 */
  updateSettings: (patch: RelationshipGraphSettingsPatch) => void;
  /** 将当前用户的设置恢复为第一版默认值。 */
  resetSettings: () => void;
  /** 是否已经在客户端完成当前用户设置的首次读取。 */
  isHydrated: boolean;
};

/** 管理并持久化指定用户的关系图谱设置。 */
export function useRelationshipGraphSettings(userId: string | number): UseRelationshipGraphSettingsResult {
  const normalizedUserId = String(userId);
  const storageKey = useMemo(
    () => getRelationshipGraphSettingsStorageKey(normalizedUserId),
    [normalizedUserId],
  );
  const [settings, setSettings] = useState<RelationshipGraphSettings>(() =>
    createDefaultRelationshipGraphSettings(),
  );
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const isHydrated = hydratedUserId === normalizedUserId;

  /** 用户变化时读取对应设置，并监听其他标签页对同一键的更新。 */
  useEffect(() => {
    let isCurrent = true;

    /** 在当前提交完成后读取浏览器存储，避免 Effect 内同步触发级联渲染。 */
    queueMicrotask(() => {
      if (!isCurrent) return;
      setSettings(readRelationshipGraphSettings(normalizedUserId));
      setHydratedUserId(normalizedUserId);
    });

    /** 接收同源其他标签页写入的设置，删除键时恢复默认值。 */
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== storageKey) return;
      setSettings(deserializeRelationshipGraphSettings(event.newValue));
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      isCurrent = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [normalizedUserId, storageKey]);

  /** 完成当前用户的首次读取后，将每次合法变更持久化。 */
  useEffect(() => {
    if (!isHydrated) return;
    writeRelationshipGraphSettings(normalizedUserId, settings);
  }, [isHydrated, normalizedUserId, settings]);

  /** 合并一组局部设置，避免设置面板手动拼装完整对象。 */
  const updateSettings = useCallback((patch: RelationshipGraphSettingsPatch): void => {
    setSettings((current) => mergeRelationshipGraphSettings(current, patch));
  }, []);

  /** 恢复默认值；持久化副作用会在下一次渲染后同步写入。 */
  const resetSettings = useCallback((): void => {
    setSettings(createDefaultRelationshipGraphSettings());
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    isHydrated,
  };
}
