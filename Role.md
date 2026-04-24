<!--
 * @Author: shaoliye
 * @Date: 2026-04-22 15:45:11
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-23 17:34:49
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
-->
# 文件目录规则划分
-- 整体按照业务域划分
# 组件设计
-- 页面级别组件（page）
在app/xxx/page.ts只负责：
组合模块
不写业务逻辑
-- 模块组件（modules）
如：modules/finance/components/CashflowChart.tsx
负责：业务UI，数据展示
-- 通用组件（shared）
如：shared/components/Button.tsx
负责：只放纯UI，不夹业务
# 状态管理
-- 选用Zustand
 modules/finance/store.ts
每个模块一个store
# 样式架构
-- 全局变量
:root {
  --color-bg: #0f172a;
  --color-primary: #3b82f6;
  --color-danger: #ef4444;
}
Tailwind 配置统一主题
theme: {
  extend: {
    colors: {
      primary: "var(--color-primary)",
    }
  }
}
做到换主题不用改组件
# 动效架构
-- 可以不用到处写gasp.to 可以封装一层在lib/animation
export const animateNumber = (from, to, cb) => {
  gsap.to(...)
}
# 数据库层设计
-- 请求封装 lib/request
统一：baseURL，error处理
-- webSocket封装 lib/websocket
负责：连接，重连，订阅


pnpm管理

想单独给Next装库
pnpm add gsap --filter web
意思是：在 web 这个子项目里安装 gsap
执行后效果依赖会加到：web/package.json  但 node_modules 还是由 root 管理
