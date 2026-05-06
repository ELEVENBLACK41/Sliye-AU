# src/hooks/

**全局通用自定义 Hooks**——与业务无关、可在任何项目中复用的 React Hooks 工具集。

## 核心原则

- **零业务逻辑**：不访问任何业务 store，不调用任何业务 service
- **纯工具性**：封装 DOM 行为、浏览器 API、通用交互模式
- **高复用**：可直接复制到其他 React 项目使用

## 待实现 Hooks（规划）

| Hook | 签名 | 说明 |
|---|---|---|
| `useDebounce<T>` | `(value: T, delay: number) => T` | 对值进行防抖处理，常用于搜索输入 |
| `useThrottle<T>` | `(value: T, limit: number) => T` | 对值进行节流处理 |
| `useLocalStorage<T>` | `(key: string, defaultValue: T)` | 读写 localStorage，自动序列化/反序列化 |
| `useBoolean` | `(initial: boolean)` | 布尔值状态 + toggle/setTrue/setFalse 工具方法 |
| `useClickOutside` | `(ref, handler)` | 点击元素外部时触发回调，用于关闭弹窗 |
| `useMediaQuery` | `(query: string) => boolean` | 响应式媒体查询，用于条件渲染 |
| `useCopyToClipboard` | `() => [copied, copy]` | 复制文本到剪贴板，带成功状态 |
| `useIntersectionObserver` | `(ref, options?)` | 元素是否进入视口，用于懒加载和无限滚动 |

## 当前状态

目录已创建，Hooks 待实现。现有文件：
- `role.md`（目录职责说明）

## 与 `src/features/hooks/` 的区别

| | `src/hooks/`（此目录） | `src/features/hooks/` |
|---|---|---|
| 业务耦合 | 无 | 有 |
| 示例 | `useDebounce`、`useLocalStorage` | `useCurrentUser`、`usePermission` |
