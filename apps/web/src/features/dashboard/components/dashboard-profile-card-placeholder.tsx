/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-29 17:35:13
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-30 09:34:17
 * @FilePath: \NextNest\apps\web\src\features\dashboard\components\dashboard-profile-card-placeholder.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件展示新版工作台的个人资料卡，当前人物图片与资料均为真实感静态占位。
 */
import Image from 'next/image';

/** 渲染写实人物图片和底部个人资料摘要。 */
export function DashboardProfileCardPlaceholder() {
  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-[inherit] lg:min-h-[22rem]">
      <Image
        src="/images/dashboard-profile-placeholder.png"
        alt="示例用户陈屿的个人资料照片"
        fill
        priority
        sizes="(min-width: 1280px) 20vw, (min-width: 768px) 50vw, 100vw"
        className="object-cover object-[center_28%]"
      />

      <div
        className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_48%,rgba(31,32,30,0.06)_68%,rgba(31,32,30,0.28)_100%)]"
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 px-5 pt-20 pb-5 text-white">
        <div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(58,53,47,0)_0%,rgba(58,53,47,0.44)_44%,rgba(37,34,30,0.82)_100%)] backdrop-blur-[10px] [mask-image:linear-gradient(to_bottom,transparent_0%,black_42%)]"
          aria-hidden
        />

        <div className="relative flex min-w-0 -translate-y-5 items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl leading-none font-medium tracking-tight">Sliye</h2>
            <p className="mt-2 truncate text-xs text-white/50">风控发展部 · 策略平台组</p>
          </div>
        </div>
      </div>
    </div>
  );
}
