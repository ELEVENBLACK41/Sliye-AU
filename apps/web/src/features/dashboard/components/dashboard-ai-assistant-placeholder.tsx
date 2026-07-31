/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-30 16:37:40
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-31 10:24:17
 * @FilePath: \NextNest\apps\web\src\features\dashboard\components\dashboard-ai-assistant-placeholder.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件展示新版工作台左下角的毛玻璃 AI 决策助手卡片，当前仅使用静态内容预览视觉样式。
 */
import { Maximize2, Send, Zap } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';

/** AI 决策助手在真实接口接入前展示的快捷问题。 */
const assistantSuggestions = ['待我表态', '总结分歧', '生成会议议程'] as const;

/** 渲染静态 AI 决策助手内容，不执行放大、提问和语音操作。 */
export function DashboardAiAssistantPlaceholder() {
  return (
    <section
      className="relative flex h-full min-h-[20rem] flex-col overflow-hidden rounded-[inherit] px-6 pt-6 pb-5"
      aria-labelledby="dashboard-ai-assistant-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(255,255,255,0.16),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_48%,rgba(255,220,74,0.035)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
        aria-hidden
      />

      <header className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#171813] text-white shadow-[0_5px_12px_rgba(32,31,18,0.18)]">
            <Zap className="size-4 fill-current" aria-hidden />
          </span>
          <h2 id="dashboard-ai-assistant-title" className="truncate text-sm font-semibold text-[#292a27]">
            AI 决策助手
          </h2>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-2xl border border-white/75 bg-[#f4f4f1]/80 text-[#343532] shadow-[0_8px_20px_rgba(41,42,39,0.08)] backdrop-blur-md hover:bg-[#fafaf8]/90"
          aria-label="放大 AI 决策助手"
        >
          <Maximize2 className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="relative flex flex-1 flex-col justify-end pt-14 pb-7">
        <p className="max-w-[16rem] text-[1.55rem] leading-[1.16] font-normal tracking-[-0.045em] text-[#292a27]">
          今天有哪些决策
          <br />
          <strong className="font-semibold">需要我关注？</strong>
        </p>

        {/* <div className="mt-6 flex flex-wrap gap-2" aria-label="快捷提问">
          {assistantSuggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-xl border border-white/75 bg-[#f4f4f1]/80 px-3 text-[11px] font-medium text-[#41423f] shadow-[0_8px_18px_rgba(41,42,39,0.07)] backdrop-blur-md hover:bg-[#fafaf8]/90"
            >
              {suggestion}
            </Button>
          ))}
        </div> */}
      </div>

      <footer className="relative flex items-center gap-2 rounded-2xl border border-white/75 bg-[#f4f4f1]/80 p-1.5 shadow-[0_10px_24px_rgba(41,42,39,0.08)] backdrop-blur-md">
        <Input
          type="text"
          placeholder="输入你想了解的内容…"
          aria-label="输入 AI 对话内容"
          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-[#343532] shadow-none placeholder:text-[#777873] focus-visible:ring-0"
        />
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-xl bg-[#171813] text-white shadow-[0_8px_18px_rgba(24,24,20,0.2)] hover:bg-black"
          aria-label="发送 AI 对话内容"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </footer>
    </section>
  );
}
