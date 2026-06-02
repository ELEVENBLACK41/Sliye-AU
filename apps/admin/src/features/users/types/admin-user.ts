/*
 * @Description: 这个文件定义 admin 用户页面本地展示类型。
 */

export type AdminUserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED';

export type AdminUserListItem = {
  id: number;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  status: AdminUserStatus;
  roles: string[];
  department: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};
