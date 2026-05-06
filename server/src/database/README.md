# src/database/ — 数据库基础设施层

本目录封装 Prisma 数据库的 NestJS 集成，以 `@Global()` 模块形式提供全局 `PrismaService`，业务模块无需重复导入即可直接注入使用。

---

## 文件说明

### `prisma.module.ts` — Prisma 全局模块

```ts
@Global()           // ← 全局注册，整个应用任意模块均可注入 PrismaService
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**职责**：将 `PrismaService` 注册为全局 DI（依赖注入）提供者。  
在 `AppModule` 中 `imports: [PrismaModule]` 一次之后，无需在其他模块再次导入。

---

### `prisma.service.ts` — Prisma 服务

继承 `PrismaClient`，实现 NestJS 生命周期接口，管理数据库连接：

```ts
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
```

| 生命周期钩子 | 行为 |
|-------------|------|
| `onModuleInit()` | 应用启动时调用 `$connect()`，建立数据库连接 |
| `onModuleDestroy()` | 应用关闭时调用 `$disconnect()`，优雅释放连接 |

**Prisma 7 Driver Adapter 模式**：

Prisma 7 废弃了 schema 中的 `datasource url` 配置，改为在构造函数中通过 `@prisma/adapter-pg` 传入连接串：

```ts
constructor() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,  // 从环境变量读取
  });
  super({ adapter });
}
```

> `DATABASE_URL` 需在 `.env` 中配置，格式为：  
> `postgresql://用户名:密码@主机:端口/数据库名?schema=public`

---

## 使用方式

在任意业务 Service 中直接注入，无需额外 `imports`：

```ts
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany();
  }
}
```

---

## 扩展建议

| 功能 | 建议做法 |
|------|----------|
| 查询日志 | 在 `super({ adapter, log: ['query'] })` 中开启 |
| 软删除 | 通过 Prisma 扩展（`$extends`）统一添加 `deletedAt` 过滤 |
| 事务封装 | 在此 Service 中封装 `$transaction` 工具方法供业务层调用 |
