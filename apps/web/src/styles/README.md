# src/styles/

**全局样式**——应用级 CSS 文件，包含全局重置、CSS 变量（Design Token）和 Tailwind CSS 入口。

## 文件说明

### `globals.css` — 全局样式入口

**职责**：
1. 通过 `@import "tailwindcss"` 引入 Tailwind CSS v4（新版使用 CSS 导入替代 PostCSS 指令）
2. 在 `:root` 中声明 CSS 变量（Design Token），供全局使用
3. 配置暗色模式颜色覆盖（`@media (prefers-color-scheme: dark)`）
4. 在 `@theme inline` 块中将 CSS 变量绑定到 Tailwind 主题变量

**当前 CSS 变量**：

| 变量 | 亮色值 | 暗色值 | 说明 |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | 页面背景色 |
| `--foreground` | `#171717` | `#ededed` | 主文字色 |
| `--font-sans` | `--font-geist-sans` | — | 正文字体（由 `layout.tsx` 注入） |
| `--font-mono` | `--font-geist-mono` | — | 代码字体（由 `layout.tsx` 注入） |

**引用位置**：在根布局 `src/app/layout.tsx` 中通过 `import '../styles/globals.css'` 导入，全局生效。

---

### `varables.css` — 扩展 CSS 变量（预留）

当前文件为**空**，预留用于项目扩展后的额外 Design Token，例如：

```css
/* 规划内容示例 */
:root {
  /* 主色系 */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;

  /* 间距 */
  --spacing-page: 32px;
}
```

## 规范

- 颜色、间距等设计值统一定义为 CSS 变量，通过 `@theme inline` 绑定到 Tailwind，**不在组件中硬编码颜色值**
- 组件样式优先使用 Tailwind 工具类，复杂动画或特殊情况才写自定义 CSS
- 避免在此目录写组件级样式，组件样式使用 Tailwind 类名内联
