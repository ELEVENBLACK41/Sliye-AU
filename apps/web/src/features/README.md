# src/features/

**业务特性层**——按功能域切分的业务模块集合。每个特性（Feature）自包含该业务所需的全部前端资产。

## 架构理念

遵循 **Feature-Sliced Design（FSD）** 思想：将业务代码按功能域聚合，而非按技术类型散落（不再是 "所有 hooks 放一起、所有 service 放一起"）。

一个特性完整包含：
```
features/
└── <feature-name>/
    ├── index.ts          # 对外导出（public API），仅导出此文件
    ├── components/       # 该特性的业务组件
    ├── hooks/            # 该特性的自定义 hooks
    ├── services/         # 调用 BFF 的数据请求函数
    ├── store/            # 该特性的局部状态（Zustand / Jotai slice）
    └── types/            # 该特性的 TypeScript 类型
```

## 目录说明

| 子目录 | 职责 |
|---|---|
| `test/` | 测试/示例特性模块，演示用户列表查询和数据库 seed 功能 |
| `components/` | **跨特性复用**的业务组件（所有特性共用但有业务属性的组件） |
| `hooks/` | **跨特性复用**的业务 hooks |
| `store/` | **跨特性**的共享业务状态（如购物车、通知中心等） |

> `features/components/`、`features/hooks/`、`features/store/` 存放跨特性但带有业务属性的共用代码；纯通用的无业务代码放在 `src/components/`、`src/hooks/`、`src/store/`。

## 导入规范

**只通过 `index.ts` 导入特性内容**，禁止越过 index 直接访问内部模块：
```ts
// ✅ 正确
import { getUsers, User } from '@/features/test'

// ❌ 错误（破坏特性封装边界）
import { getUsers } from '@/features/test/services/test.service'
```

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.ts` | features 层的根导出汇总（当前为空，待各特性成熟后统一导出） |

## 当前特性列表

| 特性 | 状态 | 说明 |
|---|---|---|
| `test/` | 已实现 | 用户列表查询 + 自动 seed，作为开发验证示例 |
