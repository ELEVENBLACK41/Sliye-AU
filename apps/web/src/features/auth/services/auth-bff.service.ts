import type {
  ConfirmEmailApiResponse,
  ConfirmEmailFormValues,
  LoginApiResponse,
  LoginRequestPayload,
  OperationResult,
  PasswordPublicKey,
  RegisterApiResponse,
  RegisterRequestPayload,
  SendEmailVerificationApiResponse,
  SendEmailVerificationFormValues,
} from "@/features/auth/types/auth.type"

import { requestNest } from "@/services/bff-request"
import type { NestResponse } from "@/services/bff-request"

export type { NestResponse }

export function requestLoginFromNest(
  values: LoginRequestPayload,
): Promise<NestResponse<NonNullable<LoginApiResponse["data"]>>> {
  return requestNest<NonNullable<LoginApiResponse["data"]>, LoginRequestPayload>(
    "/auth/login",
    {
      method: "POST",
      body: {
        email: values.email,
        passwordCiphertext: values.passwordCiphertext,
        passwordKeyId: values.passwordKeyId,
      },
    },
  )
}

export function requestRegisterFromNest(
  values: RegisterRequestPayload,
): Promise<NestResponse<NonNullable<RegisterApiResponse["data"]>>> {
  return requestNest<
    NonNullable<RegisterApiResponse["data"]>,
    RegisterRequestPayload
  >("/auth/register", {
    method: "POST",
    body: {
      email: values.email,
      passwordCiphertext: values.passwordCiphertext,
      passwordKeyId: values.passwordKeyId,
      name: values.name,
    },
  })
}

export function requestPasswordPublicKeyFromNest(): Promise<
  NestResponse<PasswordPublicKey>
> {
  return requestNest<PasswordPublicKey>("/auth/password-public-key", {
    method: "GET",
  })
}

export function requestConfirmEmailFromNest(
  values: ConfirmEmailFormValues,
): Promise<NestResponse<NonNullable<ConfirmEmailApiResponse["data"]>>> {
  return requestNest<
    NonNullable<ConfirmEmailApiResponse["data"]>,
    ConfirmEmailFormValues
  >("/auth/email-verification/confirm", {
    method: "POST",
    body: {
      email: values.email,
      code: values.code,
    },
  })
}

export function requestSendEmailVerificationFromNest(
  values: SendEmailVerificationFormValues,
): Promise<NestResponse<NonNullable<SendEmailVerificationApiResponse["data"]>>> {
  return requestNest<
    NonNullable<SendEmailVerificationApiResponse["data"]>,
    SendEmailVerificationFormValues
  >("/auth/email-verification/send", {
    method: "POST",
    body: {
      email: values.email,
    },
  })
}

export function requestLogoutFromNest(
  accessToken: string,
): Promise<NestResponse<OperationResult>> {
  return requestNest<OperationResult>("/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}
