# src/components/

全局通用 UI 组件库。

## 核心原则

- **零业务逻辑**：组件不调用任何 API，不直接访问全局状态（store），不包含任何业务判断
- **高复用性**：可被 `app/`、`features/` 任意层使用
- **纯展示驱动**：数据全部通过 `props` 传入，行为通过回调 `props` 向上通知

## 目录结构

```
components/
├── ui/          # 基础原子组件（Button、Input、Badge、Modal 等）
├── layout/      # 布局结构组件（Sidebar、Topbar、PageContainer 等）
└── feedback/    # 用户反馈组件（Toast、Alert、Spinner、Empty 等）
```

## 子目录说明

| 目录 | 职责 | 典型组件（待实现） |
|---|---|---|
| `ui/` | 原子级基础控件，无布局语义 | Button、Input、Select、Badge、Tag、Tooltip |
| `layout/` | 页面骨架和布局容器，无业务内容 | Sidebar、Topbar、PageContainer、Grid |
| `feedback/` | 操作结果反馈，无业务触发逻辑 | Toast、Alert、Skeleton、Spinner、EmptyState |

## 与 `features/` 的区别

| | `components/` | `features/xxx/components/` |
|---|---|---|
| 业务耦合 | 无 | 有（特定于某业务模块） |
| 复用范围 | 全局 | 仅当前特性模块 |
| 数据来源 | 只接受 props | 可连接 store 或调用 service |

> 组件如果需要读取全局状态或调用 API，应放入对应 `features/` 目录的 `components/` 下，而非此处。
