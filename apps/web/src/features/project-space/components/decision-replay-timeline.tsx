/**
 * 本文件展示与中央 D3 证据流联动的决策过程回放胶囊。
 */
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react';

import type { DecisionReplayController } from '../hooks/use-decision-replay';
import { replayEvents } from '../project-space.constants';
import { Button } from '@workspace/ui/components/button';

/** 决策过程回放胶囊的共享控制状态。 */
type DecisionReplayTimelineProps = {
  /** 页面层创建的决策回放控制器。 */
  controller: DecisionReplayController;
};

/** 渲染可控制中央 D3 动画的决策过程回放胶囊。 */
export function DecisionReplayTimeline({ controller }: DecisionReplayTimelineProps) {
  const [isReplayVisible, setIsReplayVisible] = useState(true);
  const replayPanelRef = useRef<HTMLElement | null>(null);
  const revealControlRef = useRef<HTMLButtonElement | null>(null);
  const eventButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasMountedRef = useRef(false);

  /** 根据展开状态驱动回放胶囊上下浮动，并在系统减少动态效果时直接切换。 */
  useLayoutEffect(() => {
    const replayPanel = replayPanelRef.current;
    const revealControl = revealControlRef.current;
    if (!replayPanel || !revealControl) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : 0.42;
    gsap.killTweensOf([replayPanel, revealControl]);

    if (!hasMountedRef.current) {
      gsap.set(replayPanel, { autoAlpha: 0, y: 72, scale: 0.985 });
      gsap.set(revealControl, { autoAlpha: 0, pointerEvents: 'none', y: 18 });
      hasMountedRef.current = true;
    }

    if (isReplayVisible) {
      gsap.set(replayPanel, { pointerEvents: 'auto', visibility: 'visible' });
      gsap.to(replayPanel, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration,
        ease: 'power3.out',
        overwrite: 'auto',
      });
      gsap.to(revealControl, {
        autoAlpha: 0,
        pointerEvents: 'none',
        y: 18,
        duration: prefersReducedMotion ? 0 : 0.2,
        ease: 'power2.in',
        overwrite: 'auto',
      });
    } else {
      gsap.set(revealControl, { pointerEvents: 'auto', visibility: 'visible' });
      gsap.to(replayPanel, {
        autoAlpha: 0,
        pointerEvents: 'none',
        y: 72,
        scale: 0.985,
        duration: prefersReducedMotion ? 0 : 0.34,
        ease: 'power3.in',
        overwrite: 'auto',
      });
      gsap.to(revealControl, {
        autoAlpha: 1,
        y: 0,
        duration: prefersReducedMotion ? 0 : 0.28,
        delay: prefersReducedMotion ? 0 : 0.16,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }

    return () => gsap.killTweensOf([replayPanel, revealControl]);
  }, [isReplayVisible]);

  /** 时间回放跨越多个日期时，将当前事件自动滚动到胶囊可视区域中央。 */
  useEffect(() => {
    const currentButton = eventButtonRefs.current[controller.currentIndex];
    if (!currentButton) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    currentButton.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [controller.currentIndex]);

  /** 将决策回放胶囊向下收起。 */
  function hideReplay(): void {
    setIsReplayVisible(false);
  }

  /** 从页面下方重新唤出决策回放胶囊。 */
  function showReplay(): void {
    setIsReplayVisible(true);
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 lg:absolute lg:inset-x-4 lg:bottom-4">
      <section
        ref={replayPanelRef}
        inert={!isReplayVisible}
        aria-hidden={!isReplayVisible}
        aria-labelledby="replay-title"
        className="pointer-events-auto mx-auto w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/66 px-4 py-3.5 opacity-0 shadow-[0_24px_70px_rgba(27,28,25,0.22)] backdrop-blur-2xl sm:px-5"
      >
        <header className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={controller.togglePlayback}
            className="size-11 shrink-0 rounded-full border-black/12 bg-[#292a27] text-white shadow-none hover:bg-[#3b3c38] hover:text-white"
            aria-label={controller.isPlaying ? '暂停决策过程回放' : '播放决策过程回放'}
          >
            {controller.isPlaying ? <Pause className="size-4 fill-current" aria-hidden /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden />}
          </Button>

          <div className="mr-auto min-w-36">
            <p className="text-[9px] font-semibold tracking-[0.16em] text-black/35">DECISION REPLAY</p>
            <div className="flex items-center gap-2">
              <h2 id="replay-title" className="text-sm font-semibold tracking-tight">决策过程回放</h2>
              <span className="text-[10px] text-black/35">每事件 1.4 秒</span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={controller.resetReplay}
            className="size-8 rounded-full text-black/48 hover:bg-black/[0.06] hover:text-black"
            aria-label="回到决策过程起点"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={controller.cycleSpeed}
            className="h-8 rounded-full border-black/10 bg-white/50 px-3 text-xs shadow-none"
            aria-label={`当前 ${controller.speed} 倍速，点击切换倍速`}
          >
            {controller.speed}×
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={hideReplay}
            className="h-8 rounded-full px-2.5 text-xs text-black/48 hover:bg-black/[0.06] hover:text-black"
            aria-label="隐藏决策过程回放"
          >
            <ChevronDown className="size-3.5" aria-hidden />
            隐藏
          </Button>
        </header>

        <div className="mt-3 w-full min-w-0 touch-pan-x overflow-x-auto overscroll-x-contain pb-1" aria-label="决策回放事件轨道">
          <ol className="relative grid w-full grid-flow-col auto-cols-[12.5%] items-start px-2 pt-1">
            {replayEvents.map((event, index) => {
              const isCurrent = index === controller.currentIndex;
              const isPast = index < controller.currentIndex;
              const connectionProgress = isPast ? 100 : isCurrent ? controller.progress * 100 : 0;

              return (
                <li key={event.id} className="relative flex min-w-0 justify-center px-1 text-center">
                  {index < replayEvents.length - 1 ? (
                    <span
                      className="absolute top-[0.68rem] left-1/2 h-px w-full bg-black/12"
                      style={{
                        backgroundImage: `linear-gradient(to right, #e7b200 ${connectionProgress}%, transparent ${connectionProgress}%)`,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  <button
                    ref={(button) => {
                      eventButtonRefs.current[index] = button;
                    }}
                    type="button"
                    onClick={() => controller.seekToEvent(index)}
                    className="group flex w-full min-w-0 flex-col items-center rounded-xl px-1 pb-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#d5a400]/60"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span
                      className={`relative z-10 grid size-3.5 place-items-center rounded-full transition-all ${
                        isCurrent
                          ? 'scale-110 bg-[#efb900] ring-4 ring-[#efb900]/18'
                          : isPast
                            ? 'bg-[#efb900]'
                            : 'border border-black/25 bg-[#f8f7f2] group-hover:border-black/50'
                      }`}
                      aria-hidden
                    />
                    <span className={`mt-2 text-[9px] font-semibold ${isCurrent ? 'text-[#8a6a00]' : 'text-black/35'}`}>
                      {event.timeLabel}
                    </span>
                    <span className={`mt-0.5 line-clamp-1 text-[11px] ${isCurrent ? 'font-semibold text-black/75' : 'text-black/48'}`}>
                      {event.phase} · {event.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <Button
        ref={revealControlRef}
        type="button"
        onClick={showReplay}
        tabIndex={isReplayVisible ? -1 : 0}
        aria-hidden={isReplayVisible}
        className="pointer-events-none absolute right-1/2 bottom-0 h-11 translate-x-1/2 rounded-full border border-white/80 bg-[#292a27]/88 px-5 text-sm text-white opacity-0 shadow-[0_14px_36px_rgba(27,28,25,0.24)] backdrop-blur-xl hover:bg-[#292a27]"
      >
        <ChevronUp className="size-4" aria-hidden />
        显示过程回放
      </Button>
    </div>
  );
}
