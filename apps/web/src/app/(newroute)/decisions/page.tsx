/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-10 14:30:06
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-10 15:29:33
 * @FilePath: \NextNest\apps\web\src\app\(newroute)\decisions\page.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件提供新版决策中心路由，在权限校验后并行启动活动、分析与档案查询。
 */
import { Suspense } from 'react';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import {
  DecisionActivityStream,
  DecisionAnalyticsStream,
  DecisionArchiveStream,
} from '@/features/decision-center/components/decision-center-streams';
import {
  DecisionActivitySkeleton,
  DecisionAnalyticsSkeleton,
  DecisionArchiveSkeleton,
} from '@/features/decision-center/components/decision-center-skeletons';
import {
  getDecisionCenterActivity,
  getDecisionCenterAnalytics,
  getDecisionCenterArchive,
} from '@/features/decision-center/services/decision-center-server.service';

/** 渲染跨项目决策过程档案与分析页面。 */
export default async function DecisionsPage() {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const activityPromise = getDecisionCenterActivity();
  const analyticsPromise = getDecisionCenterAnalytics();
  const archivePromise = getDecisionCenterArchive();

  return (
    <section className="flex flex-1 flex-col gap-6 py-7 sm:py-9" aria-label="决策中心">
      <Suspense fallback={<DecisionActivitySkeleton />}>
        <DecisionActivityStream data={activityPromise} />
      </Suspense>
      {/* 六个边界 */}
      <Suspense fallback={<DecisionAnalyticsSkeleton />}>
        <DecisionAnalyticsStream data={analyticsPromise} />
      </Suspense>
      <Suspense fallback={<DecisionArchiveSkeleton />}>
        <DecisionArchiveStream data={archivePromise} />
      </Suspense>
    </section>
  );
}
