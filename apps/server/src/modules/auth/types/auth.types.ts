import { Request } from 'express';
import { UserStatus } from '../../../generated/prisma';

export interface RequestClientMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthUserResponse {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessTokenPayload {
  sub: number;
  email: string;
  sid: string;
  type: 'access';
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthRequestContext {
  userId: number;
  email: string;
  sessionId: string;
  tokenId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthRequestContext;
  user?: AuthUserResponse;
}

export interface AuthTokensResponse {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  refreshTokenExpiresIn: number;
}

export interface AuthSessionResponse {
  user: AuthUserResponse;
  tokens: AuthTokensResponse;
}

export interface EmailVerificationState {
  required: boolean;
  sentTo: string;
  expiresAt: string | null;
  cooldownSeconds: number;
}

export interface RegisterResponse {
  user: AuthUserResponse;
  emailVerification: EmailVerificationState;
}

export interface OperationResult {
  success: boolean;
}
