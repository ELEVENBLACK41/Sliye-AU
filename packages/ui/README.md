# @workspace/ui — 共享 UI 组件库

基于 shadcn/ui 封装的公共组件包，供 `apps/web`、`apps/admin` 等所有前端应用共享使用。

---

## 目录结构

```
packages/ui/
  components/          ← shadcn 基础组件，平铺放这里
    button.tsx
    badge.tsx
    ...
  charts/              ← 自定义分类目录示例（需手动注册，见下文）
    line-chart.tsx
    ...
  lib/
    utils.ts           ← cn() 工具函数
  components.json      ← shadcn CLI 配置
  package.json         ← exports 字段控制哪些目录可被外部 import
```

---

## 为什么要这样做？

项目有多个前端应用（web、admin），如果各自安装 shadcn/ui：
- 同样的组件要写多遍，改一处容易漏另一处
- UI 风格难以保持一致
- 依赖版本各自管理，升级麻烦

**解决方案**：把组件统一放在 `packages/ui`，通过 pnpm workspace 注册为本地包 `@workspace/ui`，所有应用像引用 npm 包一样使用它，改一处、处处生效。

```
pnpm-workspace.yaml 把 packages/* 注册为工作区
  → packages/ui 的包名是 @workspace/ui
  → apps/web/package.json 里写 "@workspace/ui": "workspace:*"
  → 实际是本地符号链接，修改立即生效，无需发布
```

---

## 在应用中使用组件

```tsx
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
```

---

## 添加 shadcn 组件到 components/（完整流程）

shadcn CLI 默认将组件安装到 `components.json` 中 `ui` alias 指向的目录，即 `components/`。

### 第一步：在 monorepo 根目录执行 CLI

```bash
# 必须在根目录执行，-c 指定目标包
pnpm dlx shadcn@latest add badge   -c packages/ui
pnpm dlx shadcn@latest add input   -c packages/ui
pnpm dlx shadcn@latest add dialog  -c packages/ui
```

组件文件自动生成到 `packages/ui/components/<组件名>.tsx`。

### 第二步：在应用中 import 使用

```tsx
import { Badge } from "@workspace/ui/components/badge"

<Badge>New</Badge>
<Badge variant="outline">Draft</Badge>
```

无需重新 `pnpm install`，workspace 是符号链接，新增文件立即可用。

---

## 新建自定义文件夹放组件（完整流程）

shadcn CLI 只能往 `components.json` 中 `aliases.ui` 指向的目录装，如果你想按业务分类（如 `charts/`、`forms/`、`layout/`），有两种方式：

### 方式一：手动新建（推荐自定义组件）

直接在 `packages/ui/` 下新建目录和文件，不依赖 CLI。

**第一步：在 `package.json` 的 `exports` 中注册新目录**

打开 `packages/ui/package.json`，在 `exports` 字段中添加一行：

```json
"exports": {
  "./*": "./*.tsx",
  "./lib/*": "./lib/*.ts",
  "./components/*": "./components/*.tsx",
  "./charts/*": "./charts/*.tsx"    ← 新增，格式固定
}
```

**规律**：`"./目录名/*": "./目录名/*.tsx"`，不注册的目录 import 时会报 `Package path is not exported` 错误。

**第二步：创建目录和组件文件**

在 `packages/ui/charts/` 下新建组件，导入工具函数用相对路径：

```tsx
// packages/ui/charts/line-chart.tsx
import { cn } from "../lib/utils"   // ← 相对路径，不要用 @/

export function LineChart({ className }: { className?: string }) {
  return <div className={cn("...", className)}>...</div>
}
```

**第三步：在应用中 import 使用**

```tsx
import { LineChart } from "@workspace/ui/charts/line-chart"

<LineChart className="h-64" />
```

---

### 方式二：用 shadcn CLI 安装到自定义目录

shadcn CLI 读取 `components.json` 里的 `aliases.ui` 来决定输出目录，没有直接指定路径的参数。要装到自定义目录，需临时修改该配置：

**第一步：修改 `packages/ui/components.json`，把 `ui` alias 改为目标目录**

```json
// 原来
"aliases": {
  "ui": "@workspace/ui/components"
}

// 改为你的目标目录，例如 charts
"aliases": {
  "ui": "@workspace/ui/charts"
}
```

**第二步：在 monorepo 根目录执行 CLI**

```bash
pnpm dlx shadcn@latest add chart -c packages/ui
```

组件会生成到 `packages/ui/charts/chart.tsx`。

**第三步：还原 `components.json`**

```json
"aliases": {
  "ui": "@workspace/ui/components"   ← 改回来
}
```

**第四步：在 `package.json` 的 `exports` 中注册新目录（同方式一第一步）**

```json
"exports": {
  "./charts/*": "./charts/*.tsx"    ← 新增
}
```

**第五步：在应用中 import 使用**

```tsx
import { ChartContainer } from "@workspace/ui/charts/chart"
```

---

## 样式配置

shadcn 的 CSS 变量（`:root` 色值）需要在**各应用自己的** globals.css 中引入，不在这里统一管理：

```
apps/web/src/styles/globals.css   ← 贴入 shadcn 的 :root 变量
apps/admin/app/globals.css        ← 同上
```

---

## 自定义组件开发规范

1. shadcn 组件放 `components/`，自定义分类组件放对应子目录（需先在 `package.json` 注册）
2. 导入工具函数用相对路径 `"../lib/utils"`，**不要用** `@/`（`@/` 是各 app 自己的路径别名）
3. 无需重新 `pnpm install`，workspace 符号链接实时生效

shadcn 的 CSS 变量（`:root` 色值）需要在**各应用自己的** globals.css 中引入，不在这里统一管理：

```
apps/web/src/styles/globals.css   ← 贴入 shadcn 的 :root 变量
apps/admin/app/globals.css        ← 同上
```

---

## 自定义组件开发规范

1. 在 `packages/ui/components/` 下新建组件文件，**直接平铺，不要建子目录**
2. 导入工具函数用相对路径 `"../lib/utils"`，**不要用** `@/`（`@/` 是各 app 自己的别名）
3. 在应用中用 `"@workspace/ui/components/组件名"` 导入
4. 无需重新 `pnpm install`（workspace 是符号链接，实时生效）