/**
 * 本文件展示工作台右下角的可拖拽决策卡片堆，支持长按后甩动卡片切换下一项决策。
 */
'use client';

import { useLayoutEffect, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, GripHorizontal, MessageCircle, UsersRound } from 'lucide-react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import type { DashboardDecisionStackItem } from '@workspace/contracts/dashboard';

import { Button } from '@workspace/ui/components/button';

gsap.registerPlugin(InertiaPlugin);

/** 一次长按拖拽过程中需要保存的瞬时数据。 */
type DragSession = {
  /** 长按是否已经激活。 */
  activated: boolean;
  /** 长按计时器。 */
  holdTimer: ReturnType<typeof setTimeout>;
  /** 上一次移动事件横坐标。 */
  lastX: number;
  /** 上一次移动事件纵坐标。 */
  lastY: number;
  /** 上一次移动事件时间。 */
  lastTime: number;
  /** 当前指针标识。 */
  pointerId: number;
  /** 在一次样式写入中更新卡片的位置与旋转角度。 */
  setTransform: (value: { rotation: number; x: number; y: number }) => void;
  /** 拖拽起始横坐标。 */
  startX: number;
  /** 拖拽起始纵坐标。 */
  startY: number;
  /** 最近一次横向速度，单位为像素每毫秒。 */
  velocityX: number;
  /** 最近一次纵向速度，单位为像素每毫秒。 */
  velocityY: number;
};

/** 决策状态在卡片堆中的文案与强调色。 */
const decisionStatusPresentation = {
  DRAFT: { label: '草稿中', className: 'bg-muted text-muted-foreground' },
  DISCUSSING: { label: '讨论中', className: 'bg-decision-accent text-decision-ink' },
  RESOLVED: { label: '已形成决议', className: 'bg-decision-resolution text-primary-foreground' },
  CANCELLED: { label: '已取消', className: 'bg-destructive/15 text-destructive' },
  ARCHIVED: { label: '已归档', className: 'bg-muted text-muted-foreground' },
} as const;

/** 按当前堆叠位置计算卡片的静止变换参数。 */
function getStackTransform(stackIndex: number) {
  return {
    rotation: stackIndex === 0 ? 0 : stackIndex % 2 === 0 ? 1.4 : -1.4,
    scale: 1 - stackIndex * 0.045,
    y: stackIndex * 13,
  };
}

/** 限制数值范围，避免拖拽旋转角度过大。 */
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/** 渲染单张决策内容卡片。 */
function DecisionCard({ item, stackIndex }: { item: DashboardDecisionStackItem; stackIndex: number }) {
  const status = decisionStatusPresentation[item.status];

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#3a3b37] p-4 text-white shadow-[0_22px_45px_rgba(0,0,0,0.34)]"
      aria-hidden={stackIndex !== 0}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
        <span className="text-[10px] font-medium tracking-[0.12em] text-white/35 uppercase">0{stackIndex + 1}</span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-5">
        <p className="mb-2 text-[11px] text-white/42">{item.projectTitle}</p>
        <h3 className="text-[1.45rem] leading-[1.15] font-semibold tracking-[-0.045em] text-balance">{item.title}</h3>
      </div>

      <div className="flex items-center gap-4 border-t border-white/10 pt-3 text-[11px] text-white/48">
        <span className="flex items-center gap-1.5">
          <UsersRound className="size-3.5" aria-hidden />
          {item.participantCount} 人参与
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-3.5" aria-hidden />
          {item.proposalCount} 个提案
        </span>
      </div>
    </article>
  );
}

/** 可拖拽决策卡片堆属性。 */
type DashboardDecisionCardStackProps = {
  /** 服务端返回的最近进行中决策。 */
  items: DashboardDecisionStackItem[];
};

/** 渲染支持长按拖拽、回弹和甩动换序的真实决策卡片堆。 */
export function DashboardDecisionCardStack({ items }: DashboardDecisionCardStackProps) {
  const [cardOrder, setCardOrder] = useState(() => items.map((item) => item.id));
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const cardElementsRef = useRef(new Map<number, HTMLDivElement>());
  const dragSessionRef = useRef<DragSession | null>(null);
  const hasPositionedCardsRef = useRef(false);
  const isAnimatingRef = useRef(false);

  /** 组件卸载时清理未结束的长按计时器和卡片动画。 */
  useEffect(() => {
    const cardElements = cardElementsRef.current;

    return () => {
      const dragSession = dragSessionRef.current;
      if (dragSession) {
        clearTimeout(dragSession.holdTimer);
      }

      cardElements.forEach((cardElement) => {
        InertiaPlugin.untrack(cardElement);
        gsap.killTweensOf(cardElement);
      });
    };
  }, []);

  /** 每次顺序变化后将卡片平滑归位到新的堆叠层级。 */
  useLayoutEffect(() => {
    cardOrder.forEach((cardId, stackIndex) => {
      const cardElement = cardElementsRef.current.get(cardId);

      if (!cardElement) {
        return;
      }

      const transform = getStackTransform(stackIndex);
      gsap.set(cardElement, { zIndex: cardOrder.length - stackIndex });

      if (!hasPositionedCardsRef.current) {
        gsap.set(cardElement, { ...transform, x: 0 });
        return;
      }

      gsap.to(cardElement, {
        ...transform,
        x: 0,
        duration: 0.55,
        ease: 'power3.out',
      });
    });

    hasPositionedCardsRef.current = true;
  }, [cardOrder]);

  /** 记录或清理单张卡片的 DOM 引用。 */
  function registerCardElement(cardId: number, cardElement: HTMLDivElement | null) {
    if (cardElement) {
      cardElementsRef.current.set(cardId, cardElement);
      return;
    }

    cardElementsRef.current.delete(cardId);
  }

  /** 将当前首张卡片移动到数据顺序末尾。 */
  function moveFrontCardToBack() {
    if (cardOrder.length <= 1) return;
    setCardOrder((currentOrder) => [...currentOrder.slice(1), currentOrder[0]]);
  }

  /** 激活当前拖拽会话并给卡片提供被抓起的视觉反馈。 */
  function activateDragSession(session: DragSession, cardElement: HTMLDivElement) {
    clearTimeout(session.holdTimer);
    session.activated = true;
    cardElement.dataset.dragging = 'true';
    InertiaPlugin.track(cardElement, 'x,y,rotation');
    gsap.to(cardElement, {
      scale: 1.025,
      duration: 0.2,
      ease: 'power2.out',
    });
  }

  /** 播放甩出动画，并在动画完成后更新牌堆顺序。 */
  function throwFrontCard(cardElement: HTMLDivElement, direction: number, velocityX: number, velocityY: number) {
    const nextCardId = cardOrder[1];
    const nextCardElement = cardElementsRef.current.get(nextCardId);
    const horizontalDestination = direction * (cardElement.offsetWidth + 150);

    isAnimatingRef.current = true;
    gsap.set(cardElement, { zIndex: cardOrder.length + 2 });

    if (nextCardElement) {
      gsap.to(nextCardElement, {
        ...getStackTransform(0),
        duration: 0.42,
        ease: 'power3.out',
      });
    }

    gsap.to(cardElement, {
      inertia: {
        x: {
          velocity: direction * Math.max(Math.abs(velocityX), 620),
          end: horizontalDestination,
        },
        y: {
          velocity: velocityY,
          min: -135,
          max: 135,
        },
        rotation: {
          velocity: clamp(velocityX * 0.045, -180, 180),
          end: direction * 18,
        },
        resistance: 1250,
        duration: { min: 0.32, max: 0.78 },
      },
      scale: 0.94,
      opacity: 0.25,
      onComplete: () => {
        InertiaPlugin.untrack(cardElement);
        gsap.set(cardElement, { opacity: 1, zIndex: 0 });
        moveFrontCardToBack();
        isAnimatingRef.current = false;
      },
    });
  }

  /** 长按最上层卡片后激活拖拽状态。 */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, cardId: number) {
    if (cardOrder.length <= 1 || cardId !== cardOrder[0] || isAnimatingRef.current) {
      return;
    }

    const cardElement = event.currentTarget;
    gsap.killTweensOf(cardElement);
    cardElement.setPointerCapture(event.pointerId);

    const holdTimer = setTimeout(() => {
      const session = dragSessionRef.current;

      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      activateDragSession(session, cardElement);
    }, 180);

    dragSessionRef.current = {
      activated: false,
      holdTimer,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      pointerId: event.pointerId,
      setTransform: gsap.quickSetter(cardElement, 'css') as (value: { rotation: number; x: number; y: number }) => void,
      startX: event.clientX,
      startY: event.clientY,
      velocityX: 0,
      velocityY: 0,
    };
  }

  /** 根据指针位移实时移动并旋转当前卡片。 */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const distanceX = event.clientX - session.startX;
    const distanceY = event.clientY - session.startY;

    if (!session.activated) {
      if (Math.hypot(distanceX, distanceY) > 9) {
        activateDragSession(session, event.currentTarget);
      } else {
        return;
      }
    }

    event.preventDefault();
    const currentTime = event.timeStamp;
    const elapsedTime = Math.max(currentTime - session.lastTime, 1);
    const instantVelocityX = (event.clientX - session.lastX) / elapsedTime;
    const instantVelocityY = (event.clientY - session.lastY) / elapsedTime;
    session.velocityX = session.velocityX * 0.62 + instantVelocityX * 0.38;
    session.velocityY = session.velocityY * 0.62 + instantVelocityY * 0.38;
    session.lastX = event.clientX;
    session.lastY = event.clientY;
    session.lastTime = currentTime;

    session.setTransform({
      x: distanceX,
      y: distanceY,
      rotation: clamp(distanceX / 12 + session.velocityX * 3, -14, 14),
    });
  }

  /** 在释放指针时判断卡片应该回弹还是甩到牌堆末尾。 */
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    clearTimeout(session.holdTimer);
    dragSessionRef.current = null;
    event.currentTarget.removeAttribute('data-dragging');

    if (!session.activated) {
      return;
    }

    const distanceX = event.clientX - session.startX;
    const releaseDelay = Math.max(event.timeStamp - session.lastTime, 0);
    const manualVelocityRetention = Math.exp(-releaseDelay / 140);
    const manualVelocityX = session.velocityX * 1000 * manualVelocityRetention;
    const manualVelocityY = session.velocityY * 1000 * manualVelocityRetention;
    const trackedVelocityX = InertiaPlugin.getVelocity(event.currentTarget, 'x');
    const trackedVelocityY = InertiaPlugin.getVelocity(event.currentTarget, 'y');
    const velocityX = Math.abs(trackedVelocityX) > Math.abs(manualVelocityX) ? trackedVelocityX : manualVelocityX;
    const velocityY = Math.abs(trackedVelocityY) > Math.abs(manualVelocityY) ? trackedVelocityY : manualVelocityY;
    const shouldThrow = Math.abs(distanceX) > 72 || Math.abs(velocityX) > 460;

    if (shouldThrow) {
      const direction = Math.sign(velocityX || distanceX) || 1;
      throwFrontCard(event.currentTarget, direction, velocityX, velocityY);
      return;
    }

    InertiaPlugin.untrack(event.currentTarget);
    gsap.to(event.currentTarget, {
      ...getStackTransform(0),
      x: 0,
      duration: 0.5,
      ease: 'back.out(1.7)',
    });
  }

  /** 指针操作被浏览器取消时复用释放逻辑恢复卡片位置。 */
  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    clearTimeout(session.holdTimer);
    dragSessionRef.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    InertiaPlugin.untrack(event.currentTarget);
    gsap.to(event.currentTarget, {
      ...getStackTransform(0),
      x: 0,
      duration: 0.42,
      ease: 'power3.out',
    });
  }

  /** 允许不方便拖拽的用户通过按钮切换下一张卡片。 */
  function handleNextCard() {
    if (isAnimatingRef.current || cardOrder.length <= 1) {
      return;
    }

    const frontCardElement = cardElementsRef.current.get(cardOrder[0]);
    if (frontCardElement) {
      throwFrontCard(frontCardElement, 1, 850, 0);
    }
  }

  return (
    <section
      className="relative flex h-full min-h-[26rem] flex-col overflow-hidden rounded-[inherit] px-5 pt-5 pb-4 select-none"
      aria-labelledby="decision-card-stack-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,214,83,0.12),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.035),transparent_48%)]"
        aria-hidden
      />

      <header className="relative flex items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-decision-accent uppercase">
            Decision deck · {cardOrder.length}
          </p>
          <h2 id="decision-card-stack-title" className="text-lg font-semibold tracking-[-0.035em] text-white">
            正在发生的决定
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNextCard}
          disabled={cardOrder.length <= 1}
          className="size-9 rounded-full border border-white/10 bg-white/[0.05] text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="查看下一项决策"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="relative my-4 min-h-[18rem] flex-1" aria-live="polite">
        {cardOrder.length === 0 ? (
          <div className="grid h-full min-h-[18rem] place-items-center rounded-[1.4rem] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
            <div>
              <p className="text-sm font-medium text-white/75">暂无正在推进的决策</p>
              <p className="mt-1 text-xs text-white/40">新建或推进决策后会出现在这里。</p>
            </div>
          </div>
        ) : null}
        {cardOrder.map((cardId, stackIndex) => {
          const item = itemById.get(cardId);

          if (!item) {
            return null;
          }

          return (
            <div
              key={item.id}
              ref={(cardElement) => registerCardElement(item.id, cardElement)}
              className="absolute inset-x-0 top-0 h-[calc(100%-2.5rem)] origin-center cursor-grab touch-none will-change-transform data-[dragging=true]:cursor-grabbing"
              onPointerDown={(event) => handlePointerDown(event, item.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              <DecisionCard item={item} stackIndex={stackIndex} />
            </div>
          );
        })}
      </div>

      <footer className="relative flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[10px] text-white/38">
        <span className="flex items-center gap-1.5">
          <GripHorizontal className="size-3.5" aria-hidden />
          长按卡片，拖拽甩动
        </span>
        <span>
          {cardOrder.length === 0
            ? '0 / 0'
            : `${items.findIndex((item) => item.id === cardOrder[0]) + 1} / ${cardOrder.length}`}
        </span>
      </footer>
    </section>
  );
}
