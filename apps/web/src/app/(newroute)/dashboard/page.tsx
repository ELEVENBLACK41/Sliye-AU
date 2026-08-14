/**
 * 本文件提供新版工作台 UI 的独立预览入口，暂时只组合页面结构与占位内容。
 */
import { DashboardPrototype } from '@/features/dashboard/components/dashboard-prototype';

/** 渲染不依赖真实数据和交互的新版工作台布局原型。 */
export default function MainPage() {
  return <DashboardPrototype />;
}
