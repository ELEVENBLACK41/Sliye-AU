/**
 * 本文件提供决策中心路由首次导航时的完整页面骨架。
 */
import {
  DecisionActivitySkeleton,
  DecisionAnalyticsSkeleton,
  DecisionArchiveSkeleton,
} from '@/features/decision-center/components/decision-center-skeletons';

/** 渲染路由级加载状态。 */
export default function DecisionCenterLoading() {
  return <section className="flex flex-1 flex-col gap-6 py-7 sm:py-9"><div><div className="h-3 w-28 animate-pulse rounded-full bg-muted" /><div className="mt-3 h-8 w-56 animate-pulse rounded-full bg-muted" /></div><DecisionActivitySkeleton /><DecisionAnalyticsSkeleton /><DecisionArchiveSkeleton /></section>;
}
