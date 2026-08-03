/**
 * 本文件展示项目空间底部的决策过程回放控制与关键事件时间轴。
 */
'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { CalendarDays, ChevronDown, ChevronUp, Play } from 'lucide-react';

import { replayEvents } from '../project-space.constants';
import { Button } from '@workspace/ui/components/button';
import { Switch } from '@workspace/ui/components/switch';

/** 渲染决策过程回放时间轴。 */
export function DecisionReplayTimeline() {
  const [isReplayVisible, setIsReplayVisible] = useState(true);
  const replayPanelRef = useRef<HTMLElement | null>(null);
  const revealControlRef = useRef<HTMLButtonElement | null>(null);
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

    return () => {
      gsap.killTweensOf([replayPanel, revealControl]);
    };
  }, [isReplayVisible]);

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
        className="pointer-events-auto mx-auto w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/62 px-5 py-4 opacity-0 shadow-[0_24px_70px_rgba(27,28,25,0.22)] backdrop-blur-2xl sm:px-6 sm:py-5"
      >
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-black/38">DECISION REPLAY</p>
            <h2 id="replay-title" className="mt-1 text-lg font-semibold tracking-tight">
              决策过程回放
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-black/55">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-black/10 bg-white/50 px-4 text-sm shadow-none"
            >
              1×
            </Button>
            <label className="flex items-center gap-2 whitespace-nowrap" htmlFor="key-events-only">
              仅看关键事件
              <Switch id="key-events-only" defaultChecked aria-label="仅看关键事件" />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={hideReplay}
              className="h-9 rounded-full px-3 text-sm text-black/55 hover:bg-black/[0.06] hover:text-black"
              aria-label="隐藏决策过程回放"
            >
              <ChevronDown className="size-4" aria-hidden />
              隐藏
            </Button>
          </div>
        </header>

        <div
          className="mt-4 w-full min-w-0 touch-pan-x overflow-x-auto overscroll-x-contain pb-2"
          aria-label="可横向滚动的决策回放轨道"
        >
          <div className="flex w-max min-w-full items-start gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 shrink-0 rounded-2xl border-black/15 bg-white/55 shadow-none"
              aria-label="播放决策过程"
            >
              <Play className="size-5 fill-current" aria-hidden />
            </Button>
            <div className="flex h-14 w-56 shrink-0 items-center gap-2 rounded-2xl border border-black/10 bg-white/45 px-4 text-sm text-black/60">
              <span>2026.04.12</span>
              <span>—</span>
              <span>2026.05.28</span>
              <CalendarDays className="ml-auto size-4 shrink-0" aria-hidden />
            </div>
            <ol className="relative flex min-w-max pt-2" aria-label="决策回放事件">
              <span className="absolute top-3.5 right-16 left-16 h-px bg-black/20" aria-hidden />
              {replayEvents.map((event) => (
                <li
                  key={`${event.date}-${event.label}`}
                  className="relative flex w-32 shrink-0 flex-col items-center px-2 text-center"
                >
                  <span
                    className={`relative z-10 size-3 rounded-full ${
                      event.active
                        ? 'bg-[#f0b900] ring-4 ring-[#f0b900]/15'
                        : 'border border-black/35 bg-[#f8f7f2]'
                    }`}
                    aria-hidden
                  />
                  <time className="mt-3 text-sm font-medium text-black/50">{event.date}</time>
                  <span className="mt-1 line-clamp-2 text-[15px] leading-5 text-black/70">{event.label}</span>
                </li>
              ))}
            </ol>
          </div>
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
