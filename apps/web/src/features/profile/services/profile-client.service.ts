/**
 * 本文件封装浏览器侧个人资料修改与头像管理请求。
 */
import type { AuthUser, UpdateAvatarResult, UpdateProfileRequestPayload } from '@workspace/contracts/auth';

import { requestData } from '@/services/request';

/** 保存当前登录用户的可编辑基本资料。 */
export function updateProfile(payload: UpdateProfileRequestPayload): Promise<AuthUser> {
  return requestData<AuthUser, UpdateProfileRequestPayload>('/api/profile', {
    method: 'PATCH',
    body: payload,
    errorMessage: '个人资料保存失败，请稍后再试',
  });
}

/** 上传并替换当前登录用户头像。 */
export function uploadAvatar(file: File): Promise<UpdateAvatarResult> {
  const formData = new FormData();
  formData.set('avatar', file);

  return requestData<UpdateAvatarResult, FormData>('/api/profile/avatar', {
    method: 'POST',
    body: formData,
    errorMessage: '头像上传失败，请稍后再试',
  });
}

/** 移除当前登录用户头像。 */
export function removeAvatar(): Promise<UpdateAvatarResult> {
  return requestData<UpdateAvatarResult>('/api/profile/avatar', {
    method: 'DELETE',
    errorMessage: '头像移除失败，请稍后再试',
  });
}
