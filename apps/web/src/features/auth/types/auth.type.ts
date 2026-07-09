export type LoginFormValues = {
  email: string;
  password: string;
};

export type RegisterFormValues = LoginFormValues & {
  name: string;
};

export type {
  AuthSession,
  AuthTokens,
  AuthUser,
  ConfirmEmailApiResponse,
  ConfirmEmailRequestPayload,
  EmailVerificationState,
  LoginApiResponse,
  LoginRequestPayload,
  OperationResult,
  PasswordPayload,
  PasswordPublicKey,
  PasswordPublicKeyApiResponse,
  RegisterApiResponse,
  RegisterRequestPayload,
  RegisterResult,
  RefreshTokenRequestPayload,
  SanitizedAuthSession,
  SanitizedAuthSessionApiResponse,
  SendEmailVerificationApiResponse,
  SendEmailVerificationRequestPayload,
} from '@workspace/contracts/auth';

export type { ApiResponse } from '@workspace/contracts/common';

export type ConfirmEmailFormValues =
  import('@workspace/contracts/auth').ConfirmEmailRequestPayload;

export type SendEmailVerificationFormValues =
  import('@workspace/contracts/auth').SendEmailVerificationRequestPayload;
