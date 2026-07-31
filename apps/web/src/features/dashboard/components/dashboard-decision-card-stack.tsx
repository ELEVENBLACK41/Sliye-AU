/**
 * 本文件展示工作台右下角的可拖拽决策卡片堆，支持长按后甩动卡片切换下一项决策。
 */
'use client';

import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ArrowUpRight, GripHorizontal, MessageCircle, UsersRound } from 'lucide-react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

import { Button } from '@workspace/ui/components/button';

gsap.registerPlugin(InertiaPlugin);//惯性动画插件

/** 单张决策卡片在样例中使用的数据结构。 */
type DecisionStackItem = {
  /** 卡片强调色。 */
  accent: string;
  /** 当前参与人数。 */
  participantCount: number;
  /** 当前提案数量。 */
  proposalCount: number;
  /** 决策所属项目空间。 */
  space: string;
  /** 决策当前阶段。 */
  stage: string;
  /** 决策标题。 */
  title: string;
  /** 卡片唯一标识。 */
  id: string;
};

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

/** 卡片堆的静态样例数据，后续可由工作台接口替换。 */
const decisionStackItems: DecisionStackItem[] = [
  {
    id: 'release-plan',
    title: '是否调整产品发布计划？',
    space: '产品路线图讨论组',
    stage: '讨论中',
    participantCount: 8,
    proposalCount: 2,
    accent: '#ffd653',
  },
  {
    id: 'meeting-summary',
    title: '会议纪要是否默认由 AI 生成？',
    space: '协作体验优化组',
    stage: '投票中',
    participantCount: 12,
    proposalCount: 3,
    accent: '#f4a7ff',
  },
  {
    id: 'data-retention',
    title: '客户数据保留周期如何调整？',
    space: '数据治理委员会',
    stage: '提案征集中',
    participantCount: 6,
    proposalCount: 4,
    accent: '#83e7c2',
  },
  {
    id: 'roadmap-priority',
    title: '下半年路线图优先投入哪条主线？',
    space: '年度规划项目空间',
    stage: '待讨论',
    participantCount: 15,
    proposalCount: 5,
    accent: '#9fc5ff',
  },
];

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
function DecisionCard({ item, stackIndex }: { item: DecisionStackItem; stackIndex: number }) {
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#3a3b37] p-4 text-white shadow-[0_22px_45px_rgba(0,0,0,0.34)] xl:p-[clamp(0.75rem,calc(1.8cqh+0.405rem),1rem)]"
      aria-hidden={stackIndex !== 0}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#22231f]"
          style={{ backgroundColor: item.accent }}
        >
          {item.stage}
        </span>
        <span className="text-[10px] font-medium tracking-[0.12em] text-white/35 uppercase">
          0{stackIndex + 1}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-5 xl:py-[clamp(0.5rem,calc(2.2cqh+0.495rem),1.25rem)]">
        <p className="mb-2 text-[11px] text-white/42">{item.space}</p>
        <h3 className="text-[1.45rem] leading-[1.15] font-semibold tracking-[-0.045em] text-balance xl:text-[clamp(1.125rem,calc(2.4cqh+0.54rem),1.45rem)]">
          {item.title}
        </h3>
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

/** 渲染支持长按拖拽、回弹和甩动换序的决策卡片堆。 */
export function DashboardDecisionCardStack() {
  const [cardOrder, setCardOrder] = useState(() => decisionStackItems.map((item) => item.id));
  const cardElementsRef = useRef(new Map<string, HTMLDivElement>());
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
  function registerCardElement(cardId: string, cardElement: HTMLDivElement | null) {
    if (cardElement) {
      cardElementsRef.current.set(cardId, cardElement);
      return;
    }

    cardElementsRef.current.delete(cardId);
  }

  /** 将当前首张卡片移动到数据顺序末尾。 */
  function moveFrontCardToBack() {
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
  function throwFrontCard(
    cardElement: HTMLDivElement,
    direction: number,
    velocityX: number,
    velocityY: number,
  ) {
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
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, cardId: string) {
    if (cardId !== cardOrder[0] || isAnimatingRef.current) {
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
      setTransform: gsap.quickSetter(cardElement, 'css') as (value: {
        rotation: number;
        x: number;
        y: number;
      }) => void,
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
    if (isAnimatingRef.current) {
      return;
    }

    const frontCardElement = cardElementsRef.current.get(cardOrder[0]);
    if (frontCardElement) {
      throwFrontCard(frontCardElement, 1, 850, 0);
    }
  }

  return (
    <section
      className="relative flex h-full min-h-[26rem] flex-col overflow-hidden rounded-[inherit] px-5 pt-5 pb-4 select-none xl:min-h-0 xl:px-[clamp(1rem,calc(2.2cqh+0.495rem),1.25rem)] xl:pt-[clamp(1rem,calc(2.2cqh+0.495rem),1.25rem)] xl:pb-[clamp(0.75rem,calc(1.8cqh+0.405rem),1rem)]"
      aria-labelledby="decision-card-stack-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,214,83,0.12),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.035),transparent_48%)]"
        aria-hidden
      />

      <header className="relative flex items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-[#ffd653] uppercase">
            Decision deck · {cardOrder.length}
          </p>
          <h2
            id="decision-card-stack-title"
            className="text-lg font-semibold tracking-[-0.035em] text-white xl:text-[clamp(1rem,calc(2cqh+0.45rem),1.125rem)]"
          >
            正在发生的决定
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNextCard}
          className="size-9 rounded-full border border-white/10 bg-white/[0.05] text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="查看下一项决策"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Button>
      </header>

      <div
        className="relative my-4 min-h-[18rem] flex-1 xl:my-[clamp(0.5rem,calc(1.8cqh+0.405rem),1rem)] xl:min-h-0"
        aria-live="polite"
      >
        {cardOrder.map((cardId, stackIndex) => {
          const item = decisionStackItems.find((candidate) => candidate.id === cardId);

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
          {decisionStackItems.findIndex((item) => item.id === cardOrder[0]) + 1} / {cardOrder.length}
        </span>
      </footer>
    </section>
  );
}
