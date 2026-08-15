/**
 * 本文件负责为单日日程中发生视觉重叠的会议分配并排轨道。
 */
import type { MeetingCenterListItem } from '@workspace/contracts/meetings';

/** 尚未分配横向轨道的会议位置。 */
export type MeetingScheduleLayoutInput = {
  /** 会议摘要。 */
  item: MeetingCenterListItem;
  /** 相对时间轴顶部的像素距离。 */
  top: number;
  /** 会议卡片可视高度。 */
  height: number;
};

/** 已完成碰撞分栏的会议位置。 */
export type PositionedMeeting = MeetingScheduleLayoutInput & {
  /** 当前会议所在的零基轨道。 */
  lane: number;
  /** 当前重叠组需要的总轨道数。 */
  laneCount: number;
};

/** 将发生视觉区间重叠的会议放进不同横向轨道。 */
export function layoutMeetingScheduleItems(inputs: MeetingScheduleLayoutInput[]): PositionedMeeting[] {
  const sortedInputs = [...inputs].sort((left, right) => left.top - right.top || left.item.id - right.item.id);
  const positioned: PositionedMeeting[] = [];
  let cluster: MeetingScheduleLayoutInput[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  /** 完成当前连续重叠组的轨道分配。 */
  function flushCluster(): void {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((input) => {
      let lane = laneEnds.findIndex((end) => end <= input.top);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = input.top + input.height;
      return { ...input, lane };
    });
    positioned.push(...assigned.map((input) => ({ ...input, laneCount: laneEnds.length })));
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  sortedInputs.forEach((input) => {
    if (cluster.length > 0 && input.top >= clusterEnd) flushCluster();
    cluster.push(input);
    clusterEnd = Math.max(clusterEnd, input.top + input.height);
  });
  flushCluster();

  return positioned;
}
