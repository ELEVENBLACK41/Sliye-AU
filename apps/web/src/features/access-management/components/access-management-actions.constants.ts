/**
 * 本文件集中维护权限管理操作组件复用的样式和枚举选项。
 */
import type { AccessUserStatus, GrantableDataScope } from '@workspace/contracts/access';

/** 操作按钮在移动端保持易点击宽度，桌面端按内容收紧并靠右对齐。 */
export const ACCESS_ACTION_BUTTON_CLASS_NAME = 'w-full sm:w-auto sm:min-w-28 sm:justify-self-end';

/** 新授权允许使用的数据范围及中文文案。 */
export const ACCESS_SCOPE_OPTIONS: Array<{ value: GrantableDataScope; label: string }> = [
  { value: 'ALL', label: '全部数据' },
  { value: 'OWN', label: '本人创建或负责' },
  { value: 'DEPT', label: '本部门' },
  { value: 'DEPT_AND_CHILD', label: '本部门及下级' },
  { value: 'PARTICIPATED', label: '参与的数据' },
];

/** 用户直接授权效果及中文文案。 */
export const ACCESS_PERMISSION_EFFECT_OPTIONS = [
  { value: 'ALLOW', label: '允许' },
  { value: 'DENY', label: '全局拒绝（优先级最高）' },
] as const;

/** 用户账号状态及中文文案。 */
export const ACCESS_USER_STATUS_OPTIONS: Array<{ value: AccessUserStatus; label: string }> = [
  { value: 'PENDING', label: '待验证' },
  { value: 'ACTIVE', label: '正常' },
  { value: 'DISABLED', label: '已禁用' },
  { value: 'LOCKED', label: '已锁定' },
];
