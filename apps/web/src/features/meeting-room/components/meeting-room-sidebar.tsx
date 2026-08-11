/**
 * 本文件提供会议房间的参会人和通话信息侧栏空状态，等待业务数据接入。
 */
import { Info, Mic, UserRound, UsersRound, Video } from 'lucide-react';

/** 渲染会议房间右侧参会信息。 */
export function MeetingRoomSidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-6">
      <section aria-labelledby="room-participants-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="room-participants-title" className="text-xl font-semibold">
            参与人
          </h2>
          <span className="text-sm text-muted-foreground">待接入</span>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
            <UserRound aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">当前用户</p>
            <p className="mt-1 text-xs text-muted-foreground">身份与设备状态待接入</p>
          </div>
          <Mic aria-hidden className="size-4 text-muted-foreground" />
        </div>

        <div className="mt-3 rounded-2xl border border-dashed px-5 py-7 text-center">
          <UsersRound aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">其他参与者将在这里显示</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">接入房间成员状态后同步更新。</p>
        </div>
      </section>

      <div className="my-7 border-t" />

      <section aria-labelledby="room-call-info-title">
        <h2 id="room-call-info-title" className="flex items-center gap-2 text-lg font-semibold">
          通话信息
          <Info aria-hidden className="size-4 text-muted-foreground" />
        </h2>
        <dl className="mt-5 grid gap-4 text-sm">
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <dt className="text-muted-foreground">发起人</dt>
            <dd>待接入</dd>
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <dt className="text-muted-foreground">开始时间</dt>
            <dd>待接入</dd>
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <dt className="text-muted-foreground">默认设备</dt>
            <dd className="flex items-center gap-2">
              <Video aria-hidden className="size-4" />
              视频
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
