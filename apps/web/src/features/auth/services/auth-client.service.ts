/*
 * @Author: shaoliye
 * @Date: 2026-05-22 11:49:37
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-22 15:12:05
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import type {
  ConfirmEmailFormValues,
  EmailVerificationState,
  LoginFormValues,
  LoginRequestPayload,
  PasswordPublicKey,
  RegisterFormValues,
  RegisterRequestPayload,
  RegisterResult,
  SanitizedAuthSession,
  SendEmailVerificationFormValues,
} from "@/features/auth/types/auth.type"
import { encryptPasswordForTransport } from "@/lib/password-crypto"
import { requestData } from "@/services/request"

export async function login(values: LoginFormValues) {
  const passwordPayload = await encryptPasswordForTransport(values.password)
  const payload: LoginRequestPayload = {
    email: values.email,
    ...passwordPayload,
  }

  return requestData<SanitizedAuthSession, LoginRequestPayload>("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    body: payload,
    errorMessage: "登录失败，请稍后再试",
  })
}

export async function register(values: RegisterFormValues) {
  const passwordPayload = await encryptPasswordForTransport(values.password)
  const payload: RegisterRequestPayload = {
    email: values.email,
    name: values.name,
    ...passwordPayload,
  }

  return requestData<RegisterResult, RegisterRequestPayload>("/api/auth/register", {
    method: "POST",
    credentials: "same-origin",
    body: payload,
    errorMessage: "注册失败，请稍后再试",
  })
}

// export function getPasswordPublicKey() {
//   return requestData<PasswordPublicKey>("/api/auth/password-public-key", {
//     method: "GET",
//     credentials: "same-origin",
//     errorMessage: "无法获取密码加密公钥",
//   })
// }

export function confirmEmail(values: ConfirmEmailFormValues) {
  return requestData<SanitizedAuthSession, ConfirmEmailFormValues>(
    "/api/auth/email-verification/confirm",
    {
      method: "POST",
      credentials: "same-origin",
      body: values,
      errorMessage: "验证失败，请稍后再试",
    },
  )
}

export function sendEmailVerification(values: SendEmailVerificationFormValues) {
  return requestData<EmailVerificationState, SendEmailVerificationFormValues>(
    "/api/auth/email-verification/send",
    {
      method: "POST",
      credentials: "same-origin",
      body: values,
      errorMessage: "发送验证码失败，请稍后再试",
    },
  )
}
