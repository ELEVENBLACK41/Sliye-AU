/**
 * 本文件封装会议中心详情抽屉使用的浏览器端请求。
 */
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 懒加载指定会议详情与参与人。 */
export function getMeetingCenterDetail(meetingId: number): Promise<MeetingDetail> {
  return requestData<MeetingDetail>(`/api/meetings/${meetingId}`, {
    errorMessage: '会议详情加载失败，请稍后重试',
  });
}
