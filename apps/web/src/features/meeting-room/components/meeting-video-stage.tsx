/**
 * 本文件提供会议房间的双画面前端占位，不伪造真实参会成员或摄像头内容。
 */
import { Mic, Signal, UserRound, UsersRound } from 'lucide-react';

/** 会议画面占位配置。 */
const previewTiles = [
  { key: 'local', label: '本地画面', description: '摄像头接入后显示当前用户', icon: UserRound },
  { key: 'remote', label: '远端画面', description: '等待其他参与者进入', icon: UsersRound },
] as const;

/** 渲染响应式双画面会议舞台。 */
export function MeetingVideoStage() {
  return (
    <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2" aria-label="会议视频画面">
      {previewTiles.map((tile) => {
        const Icon = tile.icon;

        return (
          <article
            key={tile.key}
            className="relative flex min-h-52 items-center justify-center overflow-hidden rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-video shadow-2xl"
          >
            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,var(--meeting-room-foreground)_0.5px,transparent_0.5px)] [background-size:18px_18px]" aria-hidden />
            <div className="relative text-center">
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-meeting-room-control text-meeting-room-foreground/60">
                <Icon aria-hidden className="size-9" />
              </span>
              <p className="mt-4 font-medium">{tile.label}</p>
              <p className="mt-1 text-xs text-meeting-room-foreground/45">{tile.description}</p>
            </div>

            <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Signal aria-hidden className="size-4 text-meeting-room-success" />
                {tile.label}
              </span>
              <Mic aria-hidden className="size-4 text-meeting-room-foreground/65" />
            </div>
          </article>
        );
      })}
    </div>
  );
}
