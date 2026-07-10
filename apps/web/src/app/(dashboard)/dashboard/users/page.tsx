/**
 * 本文件是权限管理页面入口，在服务端执行细粒度权限校验后再渲染管理模块。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { AccessManagementPage } from '@/features/access-management';
import { requireServerPermission } from '@/features/auth/services/auth-server.service';

/** 渲染权限管理页；未授权访问统一进入中文 403 页面。 */
export default async function UsersPage() {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.access.user.read);

  return <AccessManagementPage currentUserPermissions={currentUser.permissions} />;
}
