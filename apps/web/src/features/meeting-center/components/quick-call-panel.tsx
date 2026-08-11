/**
 * 本文件实现快速通话右侧面板的前端占位结构，为后续成员、上下文和音视频能力接入预留位置。
 */
import { ChevronDown, Mic, Phone, Search, UsersRound, Video, X } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';

/** 渲染可打开的快速通话占位面板。 */
export function QuickCallPanel() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="h-11 rounded-xl bg-meeting-accent px-4 text-meeting-accent-foreground hover:bg-meeting-accent/85"
        >
          <Phone aria-hidden />
          快速通话
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden border-meeting-line bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-[27rem] lg:inset-y-4 lg:right-4 lg:h-auto lg:rounded-3xl lg:border"
        aria-describedby="quick-call-description"
      >
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-5 top-5 z-10 rounded-full"
            aria-label="关闭快速通话"
          >
            <X aria-hidden />
          </Button>
        </SheetClose>
        <SheetHeader className="border-b border-meeting-line bg-meeting-accent-soft/40 px-6 py-5 pr-16">
          <p className="text-xs font-medium text-meeting-accent-foreground">发起通话</p>
          <SheetTitle className="mt-1 text-xl font-semibold tracking-tight">快速通话</SheetTitle>
          <SheetDescription id="quick-call-description" className="mt-1">
            先保留选人和业务关联结构，成员数据与通话能力稍后接入。
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input disabled placeholder="搜索姓名或部门" className="h-11 rounded-xl bg-background pl-10" />
          </div>

          <section className="mt-6" aria-labelledby="quick-call-members-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="quick-call-members-title" className="text-sm font-semibold">
                选择联系人
              </h2>
              <span className="text-xs text-muted-foreground">已选 0 人</span>
            </div>

            <div className="mt-3 rounded-2xl border border-dashed bg-background/70 px-6 py-8 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
                <UsersRound aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold">成员数据待接入</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                后续确认组织成员与项目成员接口后，在这里提供最近联系人和搜索结果。
              </p>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border bg-background/70 p-4" aria-labelledby="call-context-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="call-context-title" className="text-sm font-semibold">
                  关联上下文（可选）
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">将通话关联到项目、分区或决策。</p>
              </div>
              <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
            </div>

            <div className="mt-4 grid gap-3">
              <Select disabled>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder">项目数据待接入</SelectItem>
                </SelectContent>
              </Select>
              <Select disabled>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="选择讨论分区" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder">分区数据待接入</SelectItem>
                </SelectContent>
              </Select>
              <Select disabled>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="选择决策" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder">决策数据待接入</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border bg-background/70 p-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Mic aria-hidden className="size-4" />
              麦克风待检测
            </span>
            <span className="flex items-center gap-2">
              <Video aria-hidden className="size-4" />
              摄像头待检测
            </span>
          </div>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-3 border-t bg-background/80 px-6 py-5">
          <Button variant="outline" size="lg" disabled className="h-12 rounded-xl">
            <Phone aria-hidden />
            语音通话
          </Button>
          <Button
            size="lg"
            disabled
            className="h-12 rounded-xl bg-meeting-accent text-meeting-accent-foreground enabled:hover:bg-meeting-accent/85"
          >
            <Video aria-hidden />
            视频通话
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
