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

type NestRequestOptions<TBody = unknown> = Omit<RequestInit, "body"> & {
  body?: TBody
}

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

async function requestNest<TData, TBody = unknown>(
  path: string,
  options?: NestRequestOptions<TBody>,
): Promise<NestResponse<TData>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError("NEST_BASE_URL 未配置，无法连接后端认证服务", 500)
  }

  const headers = new Headers(options?.headers)
  const body = formatBody(options?.body, headers)

  // BFF 到 Nest 是服务端内部请求，默认禁用缓存，避免认证状态拿到旧数据。
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body,
    cache: options?.cache ?? "no-store",
  })

  return {
    body: await parseNestBody<TData>(response),
    status: response.status,
  }
}

function getNestBaseUrl() {
  return process.env.NEST_BASE_URL?.replace(/\/$/, "")
}

function formatBody<TBody>(body: TBody | undefined, headers: Headers) {
  if (body === undefined || body === null) {
    return undefined
  }

  if (typeof body === "string" || body instanceof FormData) {
    return body
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return JSON.stringify(body)
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
