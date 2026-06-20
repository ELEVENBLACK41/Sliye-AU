/*
 * @Author: shaoliye
 * @Date: 2026-05-25 15:30:21
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-25 16:46:55
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
// 这里是BFF内部与Nest的通信
import type {
  ConfirmEmailApiResponse,
  ConfirmEmailFormValues,
  AuthUser,
  LoginApiResponse,
  LoginRequestPayload,
  OperationResult,
  PasswordPublicKey,
  RegisterApiResponse,
  RegisterRequestPayload,
  SendEmailVerificationApiResponse,
  SendEmailVerificationFormValues,
} from '@/features/auth/types/auth.type';

import { requestNest } from '@/services/bff-request';
import type { NestResponse } from '@/services/bff-request';

export type { NestResponse };

export function requestLoginFromNest(
  values: LoginRequestPayload,  //这里是参数的类型定义，要求必须包含email,passwordCiphertext,passwordKeyId这三个字段，并且都是string类型，如果缺了或者类型不对，编译器就会报错
): Promise<NestResponse<NonNullable<LoginApiResponse['data']>>> {  //这里是返回值的类型
  return requestNest<NonNullable<LoginApiResponse['data']>, LoginRequestPayload>('/auth/login', {  //第1个泛型：告诉 TData 是什么  第2个泛型：告诉 TBody 是什么
    method: 'POST',
    body: values,
  });
}

export function requestRegisterFromNest(
  values: RegisterRequestPayload,
): Promise<NestResponse<NonNullable<RegisterApiResponse['data']>>> {
  return requestNest<NonNullable<RegisterApiResponse['data']>, RegisterRequestPayload>('/auth/register', {
    method: 'POST',
    body: values,
  });
}

export function requestPasswordPublicKeyFromNest(): Promise<NestResponse<PasswordPublicKey>> {
  return requestNest<PasswordPublicKey>('/auth/password-public-key', {
    method: 'GET',
  });
}

export function requestConfirmEmailFromNest(
  values: ConfirmEmailFormValues,
): Promise<NestResponse<NonNullable<ConfirmEmailApiResponse['data']>>> {
  return requestNest<NonNullable<ConfirmEmailApiResponse['data']>, ConfirmEmailFormValues>(
    '/auth/email-verification/confirm',
    {
      method: 'POST',
      body: {
        email: values.email,
        code: values.code,
      },
    },
  );
}

export function requestSendEmailVerificationFromNest(
  values: SendEmailVerificationFormValues,
): Promise<NestResponse<NonNullable<SendEmailVerificationApiResponse['data']>>> {
  return requestNest<NonNullable<SendEmailVerificationApiResponse['data']>, SendEmailVerificationFormValues>(
    '/auth/email-verification/send',
    {
      method: 'POST',
      body: {
        email: values.email,
      },
    },
  );
}

export function requestLogoutFromNest(accessToken: string): Promise<NestResponse<OperationResult>> {
  return requestNest<OperationResult>('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// 查询当前登录用户资料，包含服务端计算后的权限码集合。
export function requestProfileFromNest(accessToken: string): Promise<NestResponse<AuthUser>> {
  return requestNest<AuthUser>('/auth/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
