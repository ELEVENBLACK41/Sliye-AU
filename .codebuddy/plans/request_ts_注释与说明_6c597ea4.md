---
name: request.ts 注释与说明
overview: 为 `apps/web/src/services/request.ts` 中的 `request`、`requestData`、`formatBody` 函数及类型定义添加中文注释和 JSDoc 说明，让代码意图和请求链路更清晰。
todos:
  - id: add-comments-request
    content: 为 request.ts 的类型、函数添加 JSDoc 和行内注释
    status: completed
---

## 用户需求

为 `apps/web/src/services/request.ts` 中的 `request` 函数及相关类型和辅助函数添加注释和说明文档，使代码意图、参数含义、请求链路、错误处理逻辑清晰可读。

## 核心内容

- 为文件级添加模块说明（职责、在请求链路中的位置）
- 为 `ApiResponse`、`JsonRequestInit`、`RequestDataOptions` 三个类型添加 JSDoc
- 为 `request()`、`requestData()`、`formatBody()` 三个函数添加 JSDoc 和关键行内注释
- 说明 `request` 与 `requestData` 的关系和使用场景区别
- 说明 `NEXT_PUBLIC_BASE_URL` 的拼接逻辑

## 实现方案

纯注释修改，不改动任何逻辑代码。在 `apps/web/src/services/request.ts` 中添加 JSDoc 注释和行内注释。

### 注释风格

- 函数使用 JSDoc 格式（`/** ... */`），描述职责、参数、返回值、抛出异常
- 类型使用 JSDoc 描述字段含义和约定
- 关键逻辑行使用 `//` 行内注释说明意图
- 模块顶部添加文件级说明，描述该模块在整个请求链路中的定位

### 关键说明点

- `request()` 是底层 fetch 封装，只关心 HTTP 层成功/失败
- `requestData()` 是业务层封装，解包 `ApiResponse` 并检查 `code === 0`
- `NEXT_PUBLIC_BASE_URL` 指向 Next.js BFF 自身（默认 localhost:3000），不是直接指向 NestJS
- `formatBody()` 自动为普通对象设置 JSON Content-Type，减少调用方重复代码