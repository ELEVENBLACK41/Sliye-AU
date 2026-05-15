# src/components/ui/

**基础原子 UI 组件**——最小粒度的可复用控件，无任何布局语义和业务含义。

## 职责

提供项目统一的视觉设计语言基础控件，作为所有复杂组件的构建积木。

## 待实现组件（规划）

| 组件 | 说明 |
|---|---|
| `Button` | 按钮，支持多种 variant（primary / secondary / ghost / danger）和 size |
| `Input` | 文本输入框，支持前缀图标、后缀图标、错误状态 |
| `Select` | 下拉选择器 |
| `Checkbox` | 复选框 |
| `Switch` | 开关切换 |
| `Badge` | 徽标，用于数字标注和状态标签 |
| `Tag` | 标签，支持关闭按钮 |
| `Avatar` | 用户头像，支持图片和首字母 fallback |
| `Tooltip` | 悬停提示气泡 |
| `Modal` | 对话框，支持受控模式 |
| `Dropdown` | 下拉菜单 |

## 当前状态

目录已创建，组件待实现。现有文件：
- `role.md`（目录职责说明，一行标注）

## 设计规范

- 所有组件使用 Tailwind CSS 编写样式，不引入额外 CSS 文件
- 组件 Props 使用 TypeScript 严格类型
- 支持 `className` prop 供外部追加样式类
- 同名组件统一从 `components/ui/index.ts` 导出（barrel export）
