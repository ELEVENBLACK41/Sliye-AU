import { type User } from '../../generated/prisma';
import { AuthUserResponse } from './types/auth.types';

type AuthUserRecord = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'avatarUrl'
  | 'status'
  | 'emailVerifiedAt'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
>;

// 将数据库用户记录转换为认证接口对外返回结构。
export function toAuthUserResponse(user: AuthUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
