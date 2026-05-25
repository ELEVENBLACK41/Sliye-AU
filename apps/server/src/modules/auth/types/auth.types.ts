import { Request } from 'express';

export type {
  AuthSession as AuthSessionResponse,
  AuthTokens as AuthTokensResponse,
  AuthUser as AuthUserResponse,
  EmailVerificationState,
  OperationResult,
  RegisterResult as RegisterResponse,
} from '@workspace/contracts/auth';

export interface RequestClientMeta {
  ipAddress?: string;
  userAgent?: string;
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
  user?: import('@workspace/contracts/auth').AuthUser;
}
