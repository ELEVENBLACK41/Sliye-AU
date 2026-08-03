/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-03 12:20:00
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-03 13:34:14
 * @FilePath: \NextNest\apps\web\src\features\project-space\components\project-space-page.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件组合新版项目空间的项目导航、决策画布、上下文详情和过程回放区域。
 */
import { DecisionContextPanel } from './decision-context-panel';
import { DecisionMapCanvas } from './decision-map-canvas';
import { DecisionReplayTimeline } from './decision-replay-timeline';
import { ProjectListPanel } from './project-list-panel';

/** 渲染项目空间完整线框，并明确各业务区域未来的数据与交互边界。 */
export function ProjectSpacePage() {
  return (
    <section className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 shadow-[0_18px_60px_rgba(41,42,39,0.08)] backdrop-blur-sm lg:overflow-hidden" aria-label="项目空间">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[12.5rem_minmax(0,1fr)_14rem] xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        {/* 左侧项目列表 */}
        <ProjectListPanel />
        {/* 决策地图画布 */}
        <DecisionMapCanvas />
        {/* 右侧项目决策详情的面板*/}
        <DecisionContextPanel />
      </div>
      {/* 下方模拟时间线 */}
      <DecisionReplayTimeline />
    </section>
  );
}
