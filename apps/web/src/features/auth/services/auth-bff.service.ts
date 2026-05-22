import type {
  ApiResponse,
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

type NestResponse<T> = {
  body: ApiResponse<T | null>
  status: number
}

export async function requestLoginFromNest(
  values: LoginRequestPayload,
): Promise<NestResponse<NonNullable<LoginApiResponse["data"]>>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      email: values.email,
      passwordCiphertext: values.passwordCiphertext,
      passwordKeyId: values.passwordKeyId,
    }),
  })

  return {
    body: await parseNestBody<NonNullable<LoginApiResponse["data"]>>(response),
    status: response.status,
  }
}

export async function requestRegisterFromNest(
  values: RegisterRequestPayload,
): Promise<NestResponse<NonNullable<RegisterApiResponse["data"]>>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      email: values.email,
      passwordCiphertext: values.passwordCiphertext,
      passwordKeyId: values.passwordKeyId,
      name: values.name || undefined,
    }),
  })

  return {
    body: await parseNestBody<NonNullable<RegisterApiResponse["data"]>>(
      response,
    ),
    status: response.status,
  }
}

export async function requestPasswordPublicKeyFromNest(): Promise<
  NestResponse<PasswordPublicKey>
> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/password-public-key`, {
    method: "GET",
    cache: "no-store",
  })

  return {
    body: await parseNestBody<PasswordPublicKey>(response),
    status: response.status,
  }
}

export async function requestConfirmEmailFromNest(
  values: ConfirmEmailFormValues,
): Promise<NestResponse<NonNullable<ConfirmEmailApiResponse["data"]>>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/email-verification/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      email: values.email,
      code: values.code,
    }),
  })

  return {
    body: await parseNestBody<NonNullable<ConfirmEmailApiResponse["data"]>>(
      response,
    ),
    status: response.status,
  }
}

export async function requestSendEmailVerificationFromNest(
  values: SendEmailVerificationFormValues,
): Promise<NestResponse<NonNullable<SendEmailVerificationApiResponse["data"]>>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/email-verification/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      email: values.email,
    }),
  })

  return {
    body: await parseNestBody<
      NonNullable<SendEmailVerificationApiResponse["data"]>
    >(response),
    status: response.status,
  }
}

export async function requestLogoutFromNest(
  accessToken: string,
): Promise<NestResponse<OperationResult>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  return {
    body: await parseNestBody<OperationResult>(response),
    status: response.status,
  }
}

function getNestBaseUrl() {
  return process.env.NEST_BASE_URL?.replace(/\/$/, "")
}

async function parseNestBody<T>(
  response: Response,
): Promise<ApiResponse<T | null>> {
  try {
    return (await response.json()) as ApiResponse<T | null>
  } catch {
    return {
      code: response.status,
      message: response.ok ? "success" : "后端认证服务响应格式异常",
      data: null,
      timestamp: Date.now(),
    }
  }
}

function createBffError<T>(message: string, status: number): NestResponse<T> {
  return {
    status,
    body: {
      code: status,
      message,
      data: null,
      timestamp: Date.now(),
    },
  }
}
