# src/ — 应用源码根目录

本目录是 NestJS 应用的全部 TypeScript 源码，遵循"模块化分层"架构。

---

## 文件说明

### `main.ts` — 应用入口

NestJS 应用的启动文件，职责：

1. 创建 NestJS 应用实例
2. 开启跨域（`app.enableCors()`）
3. **注册全局异常过滤器**（`AllExceptionsFilter`）
4. **注册全局响应拦截器**（`TransformInterceptor`）
5. 启动 HTTP 监听（默认端口 `3001`）

> 全局 Filter 须在 Interceptor 之前注册，确保异常响应也走统一格式。

---

### `app.module.ts` — 根模块

NestJS 应用的模块注册中心，所有功能模块都在此汇总：

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  // 环境变量，全局可用
    PrismaModule,                               // 数据库，全局可用
    TestModule,                                 // 业务模块
  ],
})
export class AppModule {}
```

> 每新增一个业务模块，都需要在此 `imports` 中注册。

---

## 子目录速览

| 目录 | 职责 |
|------|------|
| `database/` | Prisma 数据库服务，全局提供 `PrismaService` |
| `common/` | 跨模块公共基础设施（拦截器、过滤器、守卫等） |
| `config/` | 环境变量解析与类型化配置 |
| `modules/` | 业务功能模块（按领域划分） |
| `types/` | 全局共享 TypeScript 类型 |
| `generated/` | Prisma 自动生成的客户端代码（勿手动修改） |

> 各子目录均有独立的 `README.md` 详细说明。
