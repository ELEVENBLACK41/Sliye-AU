/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-29 14:01:36
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-29 14:12:08
 * @FilePath: \NextNest\apps\web\src\features\dashboard\components\dashboard-welcome-placeholder.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 欢迎文案和当前时间
 */
'use client';

import { useEffect, useState } from 'react';

/** 为日期时间中的个位数字补齐前导零。 */
function padDatePart(value: number): string {
  return value.toString().padStart(2, '0');
}

/** 将当前时间格式化为工作台要求的中文年月日时分格式。 */
function formatDashboardTime(date: Date): string {
  return `${date.getFullYear()}年${padDatePart(date.getMonth() + 1)}月${padDatePart(date.getDate())}日 ${padDatePart(date.getHours())}时${padDatePart(date.getMinutes())}分`;
}

/** 渲染带占位用户名并按分钟更新的欢迎信息。 */
export function DashboardWelcomePlaceholder() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    /** 将页面时间更新为浏览器所在时区的当前时间。 */
    function updateCurrentTime(): void {
      setCurrentTime(new Date());
    }

    updateCurrentTime();
    const timer = window.setInterval(updateCurrentTime, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2" aria-label="欢迎信息">
      <h1 className="text-3xl leading-none font-medium tracking-[-0.045em] text-black sm:text-5xl">
        Welcome in, <span className="text-black ">who who who</span>
      </h1>
      <time className="block text-sm font-medium tracking-wide text-black/45" dateTime={currentTime?.toISOString()}>
        {currentTime ? formatDashboardTime(currentTime) : '正在获取当前时间…'}
      </time>
    </div>
  );
}
