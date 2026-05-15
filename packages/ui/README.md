# 在 monorepo 根目录，指定 -c 到 packages/ui
pnpm dlx shadcn@latest add card -c packages/ui
pnpm dlx shadcn@latest add input -c packages/ui
pnpm dlx shadcn@latest add dialog -c packages/ui

# 应用你的 preset（所有组件一次性导入）
pnpm dlx shadcn@latest apply --preset b6YWkyP8i -c packages/ui

// apps/web 或 apps/admin 中，用法完全一致
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"

apps/web/src/styles/globals.css   ← 贴入 shadcn 的 :root 变量
apps/admin/app/globals.css        ← 同上


1. 在 packages/ui/components/ 新建组件文件
2. 从 "../lib/utils" 导入 cn()，不要用 @/
3. 在 app 中用 "@workspace/ui/components/xxx" 导入
4. 无需重新 pnpm install（workspace 是符号链接，实时生效）