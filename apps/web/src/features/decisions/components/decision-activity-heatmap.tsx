/**
 * 本文件使用 D3 构建“我的决策脉搏”日期热力图，展示用户每天参与的决策数量与关键事件构成。
 */
'use client';

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { max, scaleThreshold, utcDay, utcDays, utcFormat, utcMonday, utcMonth } from 'd3';
import { Activity, CalendarDays } from 'lucide-react';
import { gsap } from 'gsap';

import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 一天内与当前用户有关的决策活动聚合数据。 */
type DecisionActivityDatum = {
  /** UTC 日期，用于稳定计算周列与星期行。 */
  date: Date;
  /** 当天涉及的去重决策数量。 */
  decisionCount: number;
  /** 当天发生的关键决策事件总量。 */
  eventCount: number;
  /** 当天记录的会议事件数量。 */
  meetingCount: number;
  /** 当天记录的提案事件数量。 */
  proposalCount: number;
  /** 当天记录的投票事件数量。 */
  voteCount: number;
  /** 当天形成的正式决议数量。 */
  resolutionCount: number;
};

/** 热力图中一天对应的 SVG 布局数据。 */
type DecisionActivityCell = DecisionActivityDatum & {
  /** 日期稳定键。 */
  dateKey: string;
  /** SVG 中的横坐标。 */
  x: number;
  /** SVG 中的纵坐标。 */
  y: number;
  /** 当前数量对应的热力颜色。 */
  color: string;
};

/** 热力图顶部月份标签的位置。 */
type DecisionActivityMonthLabel = {
  /** 月份稳定键。 */
  key: string;
  /** 中文月份标签。 */
  label: string;
  /** SVG 中的横坐标。 */
  x: number;
};

/** 热力格尺寸。 */
const HEATMAP_CELL_SIZE = 14;
/** 热力格之间的间距。 */
const HEATMAP_CELL_GAP = 5;
/** 热力格按周排列时的步进距离。 */
const HEATMAP_CELL_STEP = HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP;
/** 预览数据结束日期，后续接入接口后由查询区间替换。 */
const PREVIEW_END_DATE = new Date(Date.UTC(2026, 7, 5));
/** D3 使用的稳定日期键格式。 */
const formatDateKey = utcFormat('%Y-%m-%d');
/** 详情面板使用的中文日期格式。 */
const formatDisplayDate = utcFormat('%m 月 %d 日');

/** 生成最近一年稳定且可重复的决策活动预览数据。 */
function createPreviewActivityData(): DecisionActivityDatum[] {
  const startDate = utcDay.offset(PREVIEW_END_DATE, -364);

  return utcDays(startDate, utcDay.offset(PREVIEW_END_DATE, 1)).map((date, index) => {
    const dateSeed = date.getUTCDate() + (date.getUTCMonth() + 1) * 3;
    const shouldRest = index % 9 === 0 || date.getUTCDay() === 0;
    const decisionCount = shouldRest ? 0 : (index * 5 + dateSeed) % 6;
    const meetingCount = decisionCount === 0 ? 0 : (index + decisionCount) % 4;
    const proposalCount = decisionCount > 1 ? (index * 2 + dateSeed) % 3 : 0;
    const voteCount = decisionCount > 0 && index % 4 === 0 ? 1 + (index % 2) : 0;
    const resolutionCount = decisionCount > 2 && index % 11 === 0 ? 1 : 0;

    return {
      date,
      decisionCount,
      eventCount: meetingCount + proposalCount + voteCount + resolutionCount,
      meetingCount,
      proposalCount,
      voteCount,
      resolutionCount,
    };
  });
}

/** 决策热力图使用的临时聚合数据。 */
const previewActivityData = createPreviewActivityData();
/** 默认选中最近一个存在决策活动的日期。 */
const defaultSelectedDateKey =
  [...previewActivityData].reverse().find((activity) => activity.decisionCount > 0)?.date
    ? formatDateKey(
        [...previewActivityData].reverse().find((activity) => activity.decisionCount > 0)!.date,
      )
    : formatDateKey(PREVIEW_END_DATE);

/** 渲染与当前页面颜色、圆角和信息密度一致的决策活动热力图。 */
export function DecisionActivityHeatmap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(defaultSelectedDateKey);
  const heatmapLayout = useMemo(() => {
    const startDate = previewActivityData[0].date;
    const calendarStart = utcMonday.floor(startDate);
    const endDate = previewActivityData[previewActivityData.length - 1].date;
    const colorScale = scaleThreshold<number, string>()
      .domain([1, 2, 3, 5])
      .range(['#fff9dc', '#fff0ad', '#ffe175', '#f7c948', '#c99000']);
    const cells: DecisionActivityCell[] = previewActivityData.map((activity) => ({
      ...activity,
      dateKey: formatDateKey(activity.date),
      x: utcMonday.count(calendarStart, activity.date) * HEATMAP_CELL_STEP,
      y: ((activity.date.getUTCDay() + 6) % 7) * HEATMAP_CELL_STEP,
      color: colorScale(activity.decisionCount),
    }));
    const months: DecisionActivityMonthLabel[] = utcMonth
      .range(utcMonth.floor(startDate), utcMonth.offset(utcMonth.floor(endDate), 1))
      .map((month) => ({
        key: utcFormat('%Y-%m')(month),
        label: `${month.getUTCMonth() + 1} 月`,
        x: Math.max(0, utcMonday.count(calendarStart, month) * HEATMAP_CELL_STEP),
      }));
    const weekCount = utcMonday.count(calendarStart, utcMonday.ceil(endDate)) + 1;

    return {
      cells,
      months,
      width: weekCount * HEATMAP_CELL_STEP,
    };
  }, []);
  const selectedActivity =
    previewActivityData.find((activity) => formatDateKey(activity.date) === selectedDateKey) ??
    previewActivityData[previewActivityData.length - 1];
  const activeDayCount = previewActivityData.filter((activity) => activity.decisionCount > 0).length;
  const involvedDecisionTotal = previewActivityData.reduce(
    (total, activity) => total + activity.decisionCount,
    0,
  );
  const highestDecisionCount = max(previewActivityData, (activity) => activity.decisionCount) ?? 0;

  /** 首次进入页面时依次点亮热力格，并尊重系统的减少动态效果设置。 */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animationContext = gsap.context(() => {
      gsap.fromTo(
        '[data-heatmap-cell]',
        { autoAlpha: 0, scale: 0.25, transformOrigin: 'center' },
        {
          autoAlpha: 1,
          scale: 1,
          duration: prefersReducedMotion ? 0 : 0.35,
          stagger: prefersReducedMotion ? 0 : { each: 0.003, from: 'start' },
          ease: 'back.out(1.8)',
        },
      );
    }, container);

    return () => animationContext.revert();
  }, []);

  /** 选择一天并更新右侧的决策活动详情。 */
  function handleDateSelect(dateKey: string): void {
    setSelectedDateKey(dateKey);
  }

  /** 允许键盘用户通过 Enter 或空格键选择日期。 */
  function handleCellKeyDown(event: KeyboardEvent<SVGRectElement>, dateKey: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleDateSelect(dateKey);
  }

  return (
    <Card
      ref={containerRef}
      className="overflow-hidden rounded-[1.75rem] border-black/5 bg-white/55 py-0 shadow-none backdrop-blur-sm"
    >
      <CardHeader className="gap-0 border-b border-black/6 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-[#d8a900]" aria-hidden />
              <CardTitle className="text-base text-[#292a27]">我的决策</CardTitle>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-[#666862]">
              查看过去一年每天参与和推动的决策，颜色越深表示涉及的决策越多。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#656760]">
            <span>
              活跃 <strong className="ml-1 text-[#292a27]">{activeDayCount}</strong> 天
            </span>
            <span>
              累计涉及 <strong className="ml-1 text-[#292a27]">{involvedDecisionTotal}</strong> 项次
            </span>
            <Badge variant="outline" className="rounded-full border-black/10 bg-white/45">
              过去一年
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="overflow-x-auto pb-2">
            <svg
              className="block min-w-max"
              width={heatmapLayout.width + 34}
              height={166}
              viewBox={`0 0 ${heatmapLayout.width + 34} 166`}
              role="img"
              aria-label="过去一年与我相关的决策数量日历热力图"
            >
              {heatmapLayout.months.map((month) => (
                <text key={month.key} x={month.x + 28} y={10} className="fill-[#777971] text-[9px]">
                  {month.label}
                </text>
              ))}

              {['一', '三', '五', '日'].map((weekday, index) => (
                <text
                  key={weekday}
                  x={0}
                  y={31 + index * HEATMAP_CELL_STEP * 2}
                  className="fill-[#8a8c85] text-[9px]"
                >
                  {weekday}
                </text>
              ))}

              <g transform="translate(28 20)">
                {heatmapLayout.cells.map((cell) => {
                  const isSelected = cell.dateKey === selectedDateKey;

                  return (
                    <rect
                      key={cell.dateKey}
                      data-heatmap-cell
                      role="button"
                      tabIndex={0}
                      aria-label={`${formatDisplayDate(cell.date)}，涉及 ${cell.decisionCount} 项决策，${cell.eventCount} 个关键事件`}
                      aria-pressed={isSelected}
                      x={cell.x}
                      y={cell.y}
                      width={HEATMAP_CELL_SIZE}
                      height={HEATMAP_CELL_SIZE}
                      rx={3}
                      fill={cell.color}
                      stroke={isSelected ? '#b77d00' : 'rgba(183,125,0,0.12)'}
                      strokeWidth={isSelected ? 2 : 1}
                      className="cursor-pointer outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70"
                      onMouseEnter={() => handleDateSelect(cell.dateKey)}
                      onFocus={() => handleDateSelect(cell.dateKey)}
                      onClick={() => handleDateSelect(cell.dateKey)}
                      onKeyDown={(event) => handleCellKeyDown(event, cell.dateKey)}
                    />
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="mt-2 flex items-center justify-between gap-4 text-[0.65rem] text-[#787a73]">
            <span>最高单日涉及 {highestDecisionCount} 项决策</span>
            <div className="flex items-center gap-1.5" aria-label="热力颜色图例">
              <span>少</span>
              {['#fff9dc', '#fff0ad', '#ffe175', '#f7c948', '#c99000'].map((color) => (
                <span
                  key={color}
                  className="size-3 rounded-[3px] border border-black/5"
                  style={{ backgroundColor: color }}
                />
              ))}
              <span>多</span>
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-black/7 bg-white/38 p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-[#666862]">
            <CalendarDays className="size-4" aria-hidden />
            <p className="text-xs">{formatDisplayDate(selectedActivity.date)}</p>
          </div>
          <p className="mt-3 text-2xl font-medium tracking-tight text-[#292a27]">
            {selectedActivity.decisionCount}
            <span className="ml-1.5 text-xs font-normal text-[#6f716a]">项相关决策</span>
          </p>
          <p className="mt-1 text-xs text-[#777971]">记录 {selectedActivity.eventCount} 个关键事件</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-black/6 pt-4 text-xs">
            <ActivityDetail label="会议" value={selectedActivity.meetingCount} color="#6c8cff" />
            <ActivityDetail label="提案" value={selectedActivity.proposalCount} color="#ed9477" />
            <ActivityDetail label="投票" value={selectedActivity.voteCount} color="#d8a900" />
            <ActivityDetail label="决议" value={selectedActivity.resolutionCount} color="#69a989" />
          </dl>
        </aside>
      </CardContent>
    </Card>
  );
}

/** 渲染选中日期中一种决策事件的数量。 */
function ActivityDetail({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[#767871]">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </dt>
      <dd className="mt-1 font-medium text-[#292a27]">{value}</dd>
    </div>
  );
}
