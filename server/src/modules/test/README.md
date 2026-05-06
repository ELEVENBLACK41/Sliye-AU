# src/modules/test/ — 测试模块

本模块是**开发调试专用模块**，用于验证基础设施（数据库连接、响应格式、拦截器/过滤器等）是否正常工作。

> 此模块在真实业务上线前可保留用于内部调试，生产环境建议通过路由守卫或环境变量控制其可访问性。

---

## 文件说明

### `test.module.ts` — 模块定义

注册本模块的 Controller 和 Service：

```ts
@Module({
  controllers: [TestController],
  providers: [TestService],
})
export class TestModule {}
```

`PrismaService` 不需要在此声明，因为 `PrismaModule` 已标注 `@Global()`，全局可注入。

---

### `test.controller.ts` — 路由控制器

**路由前缀**：`/test`

| 装饰器 | 完整路径 | 说明 |
|--------|----------|------|
| `@Get()` | `GET /test` | 心跳测试 1 |
| `@Get('test1')` | `GET /test/test1` | 心跳测试 2 |
| `@Get('users')` | `GET /test/users` | 查询用户列表（含自动 seed） |

Controller 职责仅限于路由映射，不含任何业务逻辑，全部委托给 `TestService`。

---

### `test.service.ts` — 业务服务

通过构造函数注入 `PrismaService`：

```ts
constructor(private readonly prisma: PrismaService) {}
```

**方法说明**：

| 方法 | 类型 | 说明 |
|------|------|------|
| `getTest()` | 同步 | 返回固定字符串，无 DB 操作 |
| `getTest1()` | 同步 | 同上，第二个心跳 |
| `getUsers()` | async | 查询全部用户及其关联文章；若 `User` 表为空，先执行 seed 写入 3 条示例数据 |

**`getUsers()` 自动 seed 流程**：

```
请求 GET /test/users
    ↓
user.count() === 0？
    ↓ 是               ↓ 否
写入 3 个用户            直接查询
（含关联文章）
    ↓
user.findMany({ include: { posts: true }, orderBy: { id: 'asc' } })
    ↓
返回结果数组
```

---

## 待改进

| 问题 | 建议 |
|------|------|
| Seed 逻辑混在业务方法中 | 独立为 `prisma/seed.ts`，用 `prisma db seed` 命令执行 |
| 无 DTO 校验 | 当前接口无入参，暂无需 DTO；有入参时需补充 |
| 无单元测试 | 补充 `test.service.spec.ts`，使用 Mock PrismaService 测试各方法 |
