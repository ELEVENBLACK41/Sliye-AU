/**
 * 本文件使用 D3 计算决策活动日历布局，并用 GSAP 呈现一次有节制的入场动画。
 */
'use client';

import { useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { max, scaleThreshold, utcFormat, utcMonday, utcMonth } from 'd3';
import { gsap } from 'gsap';
import type { DecisionCenterActivityDay } from '@workspace/contracts/decisions';

/** 热力图展示所需属性。 */
type DecisionActivityHeatmapProps = {
  /** 过去一年的连续日期聚合。 */
  days: DecisionCenterActivityDay[];
  /** 当前选中日期。 */
  selectedDate: string;
  /** 用户选择日期时触发。 */
  onDateSelect: (date: string) => void;
};

/** 热力格布局尺寸。 */
const CELL_SIZE = 14;
/** 热力格之间的间距。 */
const CELL_GAP = 5;
/** 每周列的步进距离。 */
const CELL_STEP = CELL_SIZE + CELL_GAP;

/** 渲染可键盘操作的日历热力图。 */
export function DecisionActivityHeatmap({ days, selectedDate, onDateSelect }: DecisionActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => buildHeatmapLayout(days), [days]);
  const highestCount = max(days, (day) => day.decisionCount) ?? 0;

  /** 首次出现时逐列点亮热力格，并尊重减少动态效果偏好。 */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = gsap.context(() => {
      gsap.fromTo(
        '[data-heatmap-cell]',
        { autoAlpha: 0, scale: reducedMotion ? 1 : 0.35, transformOrigin: 'center' },
        {
          autoAlpha: 1,
          scale: 1,
          duration: reducedMotion ? 0 : 0.3,
          stagger: reducedMotion ? 0 : { each: 0.0025, from: 'start' },
          ease: 'back.out(1.6)',
        },
      );
    }, container);
    return () => context.revert();
  }, []);

  /** 支持 Enter 与空格键选中日期。 */
  function handleCellKeyDown(event: KeyboardEvent<SVGRectElement>, date: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onDateSelect(date);
  }

  return (
    <div ref={containerRef} className="min-w-0">
      <div className="overflow-x-auto pb-2">
        <svg
          className="block min-w-max"
          width={layout.width + 34}
          height={166}
          viewBox={`0 0 ${layout.width + 34} 166`}
          role="img"
          aria-label="过去一年决策活动日历热力图"
        >
          {layout.months.map((month) => (
            <text key={month.key} x={month.x + 28} y={10} className="fill-muted-foreground text-[9px]">
              {month.label}
            </text>
          ))}
          {['一', '三', '五', '日'].map((weekday, index) => (
            <text key={weekday} x={0} y={31 + index * CELL_STEP * 2} className="fill-muted-foreground text-[9px]">
              {weekday}
            </text>
          ))}
          <g transform="translate(28 20)">
            {layout.cells.map((cell) => {
              const selected = cell.date === selectedDate;
              return (
                <rect
                  key={cell.date}
                  data-heatmap-cell
                  role="button"
                  tabIndex={0}
                  aria-label={`${formatDisplayDate(cell.date)}，${cell.decisionCount} 项决策，${cell.eventCount} 个关键事件`}
                  aria-pressed={selected}
                  x={cell.x}
                  y={cell.y}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={3}
                  fill={cell.color}
                  stroke={selected ? 'var(--decision-accent)' : 'var(--border)'}
                  strokeWidth={selected ? 2 : 1}
                  className="cursor-pointer outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70"
                  onClick={() => onDateSelect(cell.date)}
                  onKeyDown={(event) => handleCellKeyDown(event, cell.date)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 text-[0.65rem] text-muted-foreground">
        <span>最高单日涉及 {highestCount} 项决策</span>
        <div className="flex items-center gap-1.5" aria-label="热力颜色图例">
          <span>少</span>
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className="size-3 rounded-[3px] border"
              style={{ backgroundColor: `var(--decision-heat-${index})` }}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}

/** 根据连续日期计算周列、星期行和月份标签。 */
function buildHeatmapLayout(days: DecisionCenterActivityDay[]) {
  const startDate = parseDate(days[0]?.date);
  const endDate = parseDate(days[days.length - 1]?.date);
  const calendarStart = utcMonday.floor(startDate);
  const colorScale = scaleThreshold<number, string>()
    .domain([1, 2, 3, 5])
    .range([
      'var(--decision-heat-0)',
      'var(--decision-heat-1)',
      'var(--decision-heat-2)',
      'var(--decision-heat-3)',
      'var(--decision-heat-4)',
    ]);
  return {
    cells: days.map((day) => {
      const date = parseDate(day.date);
      return {
        ...day,
        x: utcMonday.count(calendarStart, date) * CELL_STEP,
        y: ((date.getUTCDay() + 6) % 7) * CELL_STEP,
        color: colorScale(day.decisionCount),
      };
    }),
    months: utcMonth.range(utcMonth.floor(startDate), utcMonth.offset(utcMonth.floor(endDate), 1)).map((month) => ({
      key: utcFormat('%Y-%m')(month),
      label: `${month.getUTCMonth() + 1} 月`,
      x: Math.max(0, utcMonday.count(calendarStart, month) * CELL_STEP),
    })),
    width: (utcMonday.count(calendarStart, utcMonday.ceil(endDate)) + 1) * CELL_STEP,
  };
}

/** 将日期键转换为稳定的 UTC 日期。 */
function parseDate(date?: string): Date {
  return new Date(`${date ?? '1970-01-01'}T00:00:00.000Z`);
}

/** 把日期键格式化为中文月日。 */
function formatDisplayDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(parseDate(date));
}
