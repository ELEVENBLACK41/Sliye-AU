/**
 * 本文件管理决策过程回放的播放、倍速、跳转与实时进度状态。
 */
'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';

import type { DecisionReplayEvent, DecisionReplaySpeed } from '../types/project-space.type';

const REPLAY_EVENT_DURATION = 1400;
const REPLAY_TICK_INTERVAL = 40;

/** 原子维护的回放游标，确保事件索引和当前进度不会分两次更新。 */
type ReplayCursor = {
  /** 当前事件索引。 */
  index: number;
  /** 当前事件内部进度。 */
  progress: number;
  /** 回放是否正在自动播放。 */
  isPlaying: boolean;
};

/** 回放游标支持的纯状态操作。 */
type ReplayCursorAction =
  | { type: 'tick'; delta: number }
  | { type: 'seek'; index: number }
  | { type: 'reset' }
  | { type: 'toggle' };

const initialReplayCursor: ReplayCursor = { index: 0, progress: 0, isPlaying: false };

/** 原子推进一次回放游标，任何一次 tick 最多只进入下一个事件。 */
function replayCursorReducer(cursor: ReplayCursor, action: ReplayCursorAction, eventCount: number): ReplayCursor {
  if (action.type === 'reset') return initialReplayCursor;

  if (action.type === 'toggle') {
    if (cursor.isPlaying) return { ...cursor, isPlaying: false };
    if (cursor.index === eventCount - 1 && cursor.progress >= 1) {
      return { index: 0, progress: 0, isPlaying: true };
    }
    return { ...cursor, isPlaying: true };
  }

  if (action.type === 'seek') {
    return {
      index: Math.min(Math.max(action.index, 0), eventCount - 1),
      progress: 0,
      isPlaying: false,
    };
  }

  if (!cursor.isPlaying) return cursor;
  const nextProgress = cursor.progress + action.delta;
  if (nextProgress < 1) return { ...cursor, progress: nextProgress };
  if (cursor.index >= eventCount - 1) return { ...cursor, progress: 1, isPlaying: false };

  return { ...cursor, index: cursor.index + 1, progress: 0 };
}

/** 决策回放控制器提供给中央 D3 画布与底部胶囊共享。 */
export type DecisionReplayController = {
  /** 当前播放到的事件索引。 */
  currentIndex: number;
  /** 当前事件内部的播放进度。 */
  progress: number;
  /** 回放是否正在自动播放。 */
  isPlaying: boolean;
  /** 当前播放倍速。 */
  speed: DecisionReplaySpeed;
  /** 切换播放或暂停。 */
  togglePlayback: () => void;
  /** 跳转并停留在指定事件。 */
  seekToEvent: (index: number) => void;
  /** 切换到下一个播放倍速。 */
  cycleSpeed: () => void;
  /** 回到决策过程起点。 */
  resetReplay: () => void;
};

/** 创建一份由回放胶囊和 D3 画布共同消费的播放状态。 */
export function useDecisionReplay(events: DecisionReplayEvent[]): DecisionReplayController {
  const [cursor, dispatchCursor] = useReducer(
    (currentCursor: ReplayCursor, action: ReplayCursorAction) =>
      replayCursorReducer(currentCursor, action, events.length),
    initialReplayCursor,
  );
  const [speed, setSpeed] = useState<DecisionReplaySpeed>(1);

  /** 播放时以短间隔原子推进游标，避免 React 重复执行更新函数造成跳帧。 */
  useEffect(() => {
    if (!cursor.isPlaying) return;

    const timer = window.setInterval(() => {
      dispatchCursor({
        type: 'tick',
        delta: (REPLAY_TICK_INTERVAL * speed) / REPLAY_EVENT_DURATION,
      });
    }, REPLAY_TICK_INTERVAL);

    return () => window.clearInterval(timer);
  }, [cursor.isPlaying, speed]);

  /** 真实事件集合变化时回到起点，避免项目切换后游标越界。 */
  useEffect(() => {
    dispatchCursor({ type: 'reset' });
  }, [events]);

  /** 从当前位置切换播放状态，结束后再次播放会从头开始。 */
  const togglePlayback = useCallback((): void => {
    dispatchCursor({ type: 'toggle' });
  }, []);

  /** 跳转到用户选中的事件，并暂停以便查看当前证据。 */
  const seekToEvent = useCallback((index: number): void => {
    dispatchCursor({ type: 'seek', index });
  }, []);

  /** 在 1、1.5 与 2 倍速之间循环。 */
  const cycleSpeed = useCallback((): void => {
    setSpeed((previousSpeed) => (previousSpeed === 1 ? 1.5 : previousSpeed === 1.5 ? 2 : 1));
  }, []);

  /** 将回放恢复到第一条决策事件。 */
  const resetReplay = useCallback((): void => {
    dispatchCursor({ type: 'reset' });
  }, []);

  return {
    currentIndex: cursor.index,
    progress: cursor.progress,
    isPlaying: cursor.isPlaying,
    speed,
    togglePlayback,
    seekToEvent,
    cycleSpeed,
    resetReplay,
  };
}
