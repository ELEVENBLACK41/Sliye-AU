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
  ConfirmEmailApiResponse,
  ConfirmEmailFormValues,
  LoginFormValues,
  LoginRequestPayload,
  PasswordPublicKeyApiResponse,
  RegisterApiResponse,
  RegisterFormValues,
  RegisterRequestPayload,
  SanitizedAuthSessionApiResponse,
  SendEmailVerificationApiResponse,
  SendEmailVerificationFormValues,
} from "@/features/auth/types/auth.type"
import { encryptPasswordForTransport } from "@/lib/password-crypto"
import { request } from '@/services/request'

export async function login(values: LoginFormValues) {
  const passwordPayload = await encryptPasswordForTransport(values.password)
  const payload: LoginRequestPayload = {
    email: values.email,
    ...passwordPayload,
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  })

  const result = (await response.json()) as SanitizedAuthSessionApiResponse

  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "登录失败，请稍后再试")
  }

  return result.data
}

export async function register(values: RegisterFormValues) {
  const passwordPayload = await encryptPasswordForTransport(values.password)
  const payload: RegisterRequestPayload = {
    email: values.email,
    name: values.name,
    ...passwordPayload,
  }

  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  })

  const result = (await response.json()) as RegisterApiResponse

  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "注册失败，请稍后再试")
  }

  return result.data
}

export async function getPasswordPublicKey() {
  const response = await fetch("/api/auth/password-public-key", {
    method: "GET",
    credentials: "same-origin",
  })
  const result = (await response.json()) as PasswordPublicKeyApiResponse

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(result.message || "无法获取密码加密公钥")
  }

  return result.data
}

export async function confirmEmail(values: ConfirmEmailFormValues) {
  const response = await fetch("/api/auth/email-verification/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(values),
  })

  const result = (await response.json()) as SanitizedAuthSessionApiResponse

  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "验证失败，请稍后再试")
  }

  return result.data
}

export async function sendEmailVerification(
  values: SendEmailVerificationFormValues,
) {
  const response = await fetch("/api/auth/email-verification/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(values),
  })

  const result = (await response.json()) as SendEmailVerificationApiResponse

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(result.message || "发送验证码失败，请稍后再试")
  }

  return result.data
}
