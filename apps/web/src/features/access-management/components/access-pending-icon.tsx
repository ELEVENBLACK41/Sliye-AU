/**
 * 本文件提供权限管理提交按钮复用的加载状态图标。
 */
import { Loader2 } from 'lucide-react';

/** 权限管理加载图标属性。 */
type AccessPendingIconProps = {
  /** 是否显示旋转中的加载图标。 */
  active: boolean;
};

/** 在操作提交中渲染旋转图标。 */
export function AccessPendingIcon({ active }: AccessPendingIconProps) {
  return active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;
}
