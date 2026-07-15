/**
 * 本文件定义权限管理操作组件之间共享的页面数据与能力属性。
 */
import type { AccessManagementCapabilities } from './access-management-page';
import type {
  AccessManagementDashboardData,
} from '@/features/access-management/services/access-management-server.service';

/** 权限管理业务操作组件共享属性。 */
export type AccessManagementActionsProps = {
  /** 当前页面已经加载的权限管理数据。 */
  data: AccessManagementDashboardData;
  /** 当前用户可以执行的细粒度操作。 */
  capabilities: AccessManagementCapabilities;
};
