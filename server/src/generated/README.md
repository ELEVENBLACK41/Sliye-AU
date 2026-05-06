# src/generated/ — Prisma 自动生成代码（禁止手动修改）

本目录由 `prisma generate` 命令自动生成，包含完整的 **Prisma Client 类型定义和运行时代码**。

> ⚠️ **严禁手动修改此目录中的任何文件**。每次执行 `prisma generate` 都会完全覆盖本目录。

---

## 目录内容

```
generated/prisma/
├── index.js / index.d.ts          # Prisma Client 主入口（CJS 格式）
├── client.js / client.d.ts        # Client 配置类型
├── default.js / default.d.ts      # 默认导出
├── edge.js / edge.d.ts            # Edge Runtime 版本
├── index-browser.js               # 浏览器兼容版本
├── schema.prisma                  # schema 副本（内嵌到客户端）
├── package.json                   # 声明模块格式为 CJS
├── *.wasm / *.mjs                 # WebAssembly 查询编译器（edge 模式）
└── runtime/
    ├── client.js                  # 运行时核心（依赖 @prisma/client-runtime-utils）
    └── index-browser.js           # 浏览器运行时
```

---

## 使用方式

在业务代码中从此目录导入类型或客户端：

```ts
import { PrismaClient } from '../generated/prisma';
// 或导入某个模型类型
import type { User, Post } from '../generated/prisma';
```

> 在 `PrismaService` 中继承 `PrismaClient` 后，可通过 `this.prisma.user.findMany()` 等方式调用，享有完整类型推断。

---

## 为什么输出到 `src/generated/` 而非默认位置？

Prisma 默认输出到 `node_modules/@prisma/client`，本项目改为输出到 `src/generated/prisma/`，原因：

1. **构建可控**：NestJS 构建时通过 `nest-cli.json` 的 `assets` 配置将此目录复制到 `dist/src/generated/`，保证生产包完整
2. **避免 monorepo 污染**：多包工作区中不同包的 Prisma schema 分别生成到各自 `src/generated/`，互不干扰
3. **版本追踪**：生成代码的变化可通过 Git 感知（可按需加入 `.gitignore`）

---

## 何时需要重新生成

以下情况需要重新执行 `pnpm prisma generate`：

- 修改了 `prisma/schema.prisma` 中的模型定义
- 更新了 `@prisma/client` 的版本
- 首次克隆项目后（若 `generated/` 未提交到仓库）

```bash
pnpm prisma generate
```
