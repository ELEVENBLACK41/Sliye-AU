/*
 * @Description: Web BFF 与 Nest Auth 模块通信的服务封装。
 */
import type {
  AuthUser,
  ConfirmEmailApiResponse,
  ConfirmEmailFormValues,
  LoginApiResponse,
  LoginRequestPayload,
  OperationResult,
  PasswordPublicKey,
  RefreshTokenRequestPayload,
  RegisterApiResponse,
  RegisterRequestPayload,
  SendEmailVerificationApiResponse,
  SendEmailVerificationFormValues,
} from '@/features/auth/types/auth.type';

import { requestNest } from '@/services/bff-request';
import type { NestResponse } from '@/services/bff-request';

export type { NestResponse };

// 调用 Nest 登录接口，成功时返回包含用户与 token 的完整会话。
export function requestLoginFromNest(
  values: LoginRequestPayload,
): Promise<NestResponse<NonNullable<LoginApiResponse['data']>>> {
  return requestNest<
    NonNullable<LoginApiResponse['data']>,
    LoginRequestPayload
  >('/auth/login', {
    method: 'POST',
    body: values,
  });
}

// 使用 refresh token 向 Nest 换取新的 access/refresh token。
export function requestRefreshFromNest(
  refreshToken: string,
): Promise<NestResponse<NonNullable<LoginApiResponse['data']>>> {
  return requestNest<
    NonNullable<LoginApiResponse['data']>,
    RefreshTokenRequestPayload
  >('/auth/refresh', {
    method: 'POST',
    body: {
      refreshToken,
    },
  });
}

// 调用 Nest 注册接口，注册后通常需要继续完成邮箱验证。
export function requestRegisterFromNest(
  values: RegisterRequestPayload,
): Promise<NestResponse<NonNullable<RegisterApiResponse['data']>>> {
  return requestNest<
    NonNullable<RegisterApiResponse['data']>,
    RegisterRequestPayload
  >('/auth/register', {
    method: 'POST',
    body: values,
  });
}

// 获取密码传输加密需要的临时公钥与 nonce。
export function requestPasswordPublicKeyFromNest(): Promise<
  NestResponse<PasswordPublicKey>
> {
  return requestNest<PasswordPublicKey>('/auth/password-public-key', {
    method: 'GET',
  });
}

// 调用 Nest 邮箱验证码确认接口，成功后会返回登录会话。
export function requestConfirmEmailFromNest(
  values: ConfirmEmailFormValues,
): Promise<NestResponse<NonNullable<ConfirmEmailApiResponse['data']>>> {
  return requestNest<
    NonNullable<ConfirmEmailApiResponse['data']>,
    ConfirmEmailFormValues
  >('/auth/email-verification/confirm', {
    method: 'POST',
    body: {
      email: values.email,
      code: values.code,
    },
  });
}

// 请求 Nest 重新发送邮箱验证码。
export function requestSendEmailVerificationFromNest(
  values: SendEmailVerificationFormValues,
): Promise<
  NestResponse<NonNullable<SendEmailVerificationApiResponse['data']>>
> {
  return requestNest<
    NonNullable<SendEmailVerificationApiResponse['data']>,
    SendEmailVerificationFormValues
  >('/auth/email-verification/send', {
    method: 'POST',
    body: {
      email: values.email,
    },
  });
}

// 调用 Nest 注销接口，服务端会撤销当前登录会话。
export function requestLogoutFromNest(
  accessToken: string,
): Promise<NestResponse<OperationResult>> {
  return requestNest<OperationResult>('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// 查询当前登录用户资料，包含服务端计算后的权限码集合。
export function requestProfileFromNest(
  accessToken: string,
): Promise<NestResponse<AuthUser>> {
  return requestNest<AuthUser>('/auth/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
