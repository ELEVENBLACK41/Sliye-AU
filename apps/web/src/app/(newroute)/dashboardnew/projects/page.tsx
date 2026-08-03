/**
 * 本文件兼容新版项目空间迁移前的旧地址。
 */
import { redirect } from 'next/navigation';

/** 将旧的 Dashboard 子路由跳转到独立项目空间一级路由。 */
export default function LegacyProjectsPage() {
  redirect('/projects');
}
