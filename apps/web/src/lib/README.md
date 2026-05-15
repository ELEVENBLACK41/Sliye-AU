# src/lib/

**工具库 / 第三方库封装**——与 React、业务均无关的纯函数工具集和对第三方库的统一封装层。

## 核心原则

- **纯函数优先**：不依赖 React（无 hooks、无组件），函数输入输出确定
- **零业务耦合**：不包含任何业务判断和业务数据结构
- **可移植**：可直接迁移到 Node.js、其他框架项目

## 规划目录结构

```
lib/
├── utils/
│   ├── date.ts        # 日期格式化（基于 dayjs / date-fns）
│   ├── format.ts      # 数字格式化（货币、千分位、文件大小）
│   ├── validate.ts    # 通用验证函数（邮箱、手机号、身份证）
│   └── crypto.ts      # 哈希、加密工具（如密码 hash 前置处理）
├── http/
│   └── interceptors.ts # fetch 拦截器封装（token 注入、请求 ID）
├── storage/
│   └── index.ts       # localStorage / sessionStorage 封装（带过期逻辑）
└── constants/
    └── index.ts       # 全局常量（枚举值、正则等）
```

## 典型用法

```ts
import { formatDate, formatFileSize } from '@/lib/utils/format'
import { validateEmail } from '@/lib/utils/validate'
```

## 当前状态

目录已创建，工具函数待实现。现有文件：
- `role.md`（目录职责说明）

## 推荐引入的工具库

| 库 | 用途 |
|---|---|
| `dayjs` | 轻量日期处理（替代 moment.js） |
| `zod` | 运行时 schema 验证 + TypeScript 类型推导 |
| `clsx` + `tailwind-merge` | 条件 className 合并（处理 Tailwind 冲突） |
