/**
 * 本文件保留旧决策列表地址，并统一跳转到项目空间列表。
 */
import { redirect } from 'next/navigation';

/** 将旧决策列表入口迁移到项目空间。 */
export default async function DecisionsRoutePage() {
  redirect('/dashboard/projects');
}
