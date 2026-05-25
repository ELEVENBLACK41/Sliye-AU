export type LoginFormValues = {
  email: string;
  password: string;
};

export type PasswordPublicKey = {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  publicKeyPem: string;
  expiresAt: string;
  /** 一次性随机数，登录/注册时必须原样回传，消耗后不可重放 */
  nonce: string;
};

export type PasswordPayload = {
  passwordCiphertext: string;
  passwordKeyId: string;
  /** 与公钥一起下发的一次性 nonce，防重放 */
  nonce: string;
};

export type LoginRequestPayload = {
  email: string;
} & PasswordPayload;

export type RegisterFormValues = LoginFormValues & {
  name: string;
};

export type RegisterRequestPayload = {
  email: string;
  name: string;
} & PasswordPayload;

export type ConfirmEmailFormValues = {
  email: string;
  code: string;
};

export type SendEmailVerificationFormValues = {
  email: string;
};

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
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

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
  timestamp?: number;
};

export type LoginApiResponse = ApiResponse<AuthSession | null>;
export type RegisterApiResponse = ApiResponse<RegisterResult | null>;
export type SendEmailVerificationApiResponse = ApiResponse<EmailVerificationState | null>;
export type ConfirmEmailApiResponse = ApiResponse<AuthSession | null>;
export type PasswordPublicKeyApiResponse = ApiResponse<PasswordPublicKey | null>;
export type SanitizedAuthSession = {
  user: AuthUser;
};
export type SanitizedAuthSessionApiResponse = ApiResponse<SanitizedAuthSession | null>;

export type OperationResult = {
  success: boolean;
};
