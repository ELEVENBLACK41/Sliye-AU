/**
 * 本文件组合新版工作台原型的摘要和主体工作区，仅用于确认页面结构。
 */
import { DashboardSummaryPlaceholder } from './dashboard-summary-placeholder';
import { DashboardWorkspacePlaceholder } from './dashboard-workspace-placeholder';

/** 渲染不依赖真实数据、图标和交互的工作台布局原型。 */
export function DashboardPrototype() {
  return (
    <>
    {/* 上班区域 */}
      <DashboardSummaryPlaceholder />
    {/* 下班区域 */}
      <DashboardWorkspacePlaceholder />
    </>
  );
}
