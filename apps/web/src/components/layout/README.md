# src/components/layout/

**布局结构类通用组件**——提供页面骨架、导航、容器等与布局相关的 UI 结构组件。

## 职责

定义页面整体排列方式，不包含业务内容和数据逻辑。布局组件接收 `children`，对其进行排列包裹。

## 待实现组件（规划）

| 组件 | 说明 |
|---|---|
| `Sidebar` | 左侧导航栏，支持折叠展开，菜单项由外部传入（无业务硬编码） |
| `Topbar` | 顶部导航栏，包含面包屑、用户头像区域插槽 |
| `PageContainer` | 正文内容区容器，统一内边距、最大宽度约束 |
| `Grid` | 响应式栅格容器，封装常用列数配置 |
| `Divider` | 水平/垂直分割线 |

## 当前状态

目录已创建，组件待实现。现有文件：
- `role.md`（目录职责说明，一行标注）

## 使用说明

布局组件应在 `app/` 的 `layout.tsx` 中组合使用，例如：
```tsx
// app/(dashboard)/layout.tsx（未来扩展）
import { Sidebar, Topbar, PageContainer } from '@/components/layout'

export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Topbar />
        <PageContainer>{children}</PageContainer>
      </div>
    </div>
  )
}
```
