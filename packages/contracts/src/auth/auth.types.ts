import type { ApiResponse } from '../common';

export type PasswordPublicKey = {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  publicKeyPem: string;
  expiresAt: string;
  nonce: string;
};

export type PasswordPayload = {
  passwordCiphertext: string;
  passwordKeyId: string;
  nonce: string;
};

export type LoginRequestPayload = {
  email: string;
} & PasswordPayload;

export type RegisterRequestPayload = {
  email: string;
  name?: string;
} & PasswordPayload;

export type ConfirmEmailRequestPayload = {
  email: string;
  code: string;
};

export type SendEmailVerificationRequestPayload = {
  email: string;
};

export type RefreshTokenRequestPayload = {
  refreshToken: string;
};

export type AuthUserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED';

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: AuthUserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokens = {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  refreshTokenExpiresIn: number;
};

export type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
};

export type EmailVerificationState = {
  required: boolean;
  sentTo: string;
  expiresAt: string | null;
  cooldownSeconds: number;
};

export type RegisterResult = {
  user: AuthUser;
  emailVerification: EmailVerificationState;
};

export type SanitizedAuthSession = {
  user: AuthUser;
};

export type OperationResult = {
  success: boolean;
};

export type LoginApiResponse = ApiResponse<AuthSession | null>;
export type RegisterApiResponse = ApiResponse<RegisterResult | null>;
export type SendEmailVerificationApiResponse =
  ApiResponse<EmailVerificationState | null>;
export type ConfirmEmailApiResponse = ApiResponse<AuthSession | null>;
export type PasswordPublicKeyApiResponse = ApiResponse<PasswordPublicKey | null>;
export type SanitizedAuthSessionApiResponse =
  ApiResponse<SanitizedAuthSession | null>;
