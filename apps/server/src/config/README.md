# src/config/ — 配置层（待扩展）

本目录负责环境变量的**解析、校验与类型化**，是整个应用配置管理的统一入口。

当前状态：`@nestjs/config` 已在 `AppModule` 中以 `isGlobal: true` 全局初始化，并通过 `validateEnvConfig` 在启动时校验关键环境变量。

---

## 当前使用方式

```ts
// 在任意 Service 中注入 ConfigService
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SomeService {
  constructor(private readonly config: ConfigService) {}

  getDbUrl() {
    return this.config.get<string>('DATABASE_URL');
  }
}
```

---

## 已实现能力

- `DATABASE_URL` 必填，避免 Prisma 在运行期才因缺失连接串崩溃。
- `PORT`、`SERVER_API_PREFIX`、token TTL、邮箱验证码 TTL 等都有默认值。
- `production` 环境强制要求 `AUTH_ACCESS_TOKEN_SECRET` 和 `AUTH_EMAIL_CODE_SECRET`。
- API 前缀会自动去掉首尾 `/`，例如 `/api/v1/` 会被规范化为 `api/v1`。

在 `AppModule` 中启用：

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnvConfig,
})
```

---

## 后续可扩展方向

### 1. 类型化配置工厂

将松散的 `process.env` 聚合为强类型配置对象：

**`config/database.config.ts`**

```ts
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_MAX_CONN ?? '10', 10),
}));
```

在 Service 中类型安全地使用：

```ts
import { ConfigType } from '@nestjs/config';
import { databaseConfig } from '@/config/database.config';

@Inject(databaseConfig.KEY)
private readonly dbConfig: ConfigType<typeof databaseConfig>,
```

---

### 2. 建议的文件规划

```
config/
├── index.ts           # 统一导出所有配置工厂
├── env.config.ts      # 启动期环境变量校验
├── database.config.ts # 数据库配置工厂
├── jwt.config.ts      # JWT 配置工厂
└── app.config.ts      # 应用级配置（端口、前缀等）
```

---

## 注意事项

- `.env` 文件已加入 `.gitignore`，请使用 `.env.example` 作为模板提交到仓库
- 生产环境应通过 CI/CD 注入环境变量，而非依赖 `.env` 文件
