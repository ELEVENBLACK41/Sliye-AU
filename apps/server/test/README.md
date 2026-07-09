# test/ — E2E 端到端测试

本目录存放基于 **Jest + Supertest** 的 E2E（端对端）集成测试，与 `src/` 下的单元测试（`*.spec.ts`）相互补充。

---

## 文件说明

### `app.e2e-spec.ts` — 应用 E2E 测试入口

```ts
// 测试思路：启动完整 NestJS 应用，通过 HTTP 请求验证接口行为
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
```

当前仅有脚手架默认测试，待业务接口稳定后补充。

---

### `jest-e2e.json` — E2E 专用 Jest 配置

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir":              ".",
  "testEnvironment":      "node",
  "testRegex":            ".e2e-spec.ts$",
  "transform":            { "^.+\\.(t|j)s$": "ts-jest" }
}
```

与根 `jest` 配置隔离，仅匹配 `.e2e-spec.ts` 文件，避免与单元测试混跑。

---

## 运行方式

```bash
# 运行全量 E2E 测试
pnpm test:e2e

# 单元测试（src/ 下的 *.spec.ts）
pnpm test

# 单元测试覆盖率报告
pnpm test:cov
```

---

## E2E 测试规范建议

1. **测试数据库隔离**：E2E 测试应连接独立的测试数据库，避免污染开发 / 生产数据
2. **每个测试用例前清理数据**：使用 `beforeEach` 重置数据库状态
3. **测试成功路径和失败路径**：验证 `200 OK` 的同时，也要测试 `400/401/404/500` 的情况
4. **验证响应格式**：所有接口返回值须符合 `{ code, message, data, timestamp }` 统一格式

---

## 待补充的测试用例

| 接口 | 测试类型 | 预期结果 |
|------|----------|----------|
| `GET /test` | 成功 | 返回 `code: 200`，`data.msg` 为字符串 |
| `GET /test/users` | 成功（表空自动 seed） | 返回 `code: 200`，`data` 为长度 ≥ 1 的数组 |
| `GET /not-exist` | 路由不存在 | 返回 `code: 404` |
| `GET /test/users` | 数据库连接失败 | 返回 `code: 500` |
