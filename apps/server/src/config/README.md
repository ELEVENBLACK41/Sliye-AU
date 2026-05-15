# src/config/ — 配置层（待扩展）

本目录负责环境变量的**解析、校验与类型化**，是整个应用配置管理的统一入口。

当前状态：目录已预留，`@nestjs/config` 已在 `AppModule` 中以 `isGlobal: true` 全局初始化，可直接在任何 Service 中注入 `ConfigService` 使用。

---

## 当前使用方式（基础版）

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

## 推荐扩展方案

### 1. 环境变量校验（推荐优先实现）

在应用启动时校验必填环境变量，避免缺失配置导致运行时崩溃：

**`config/env.config.ts`**

```ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  PORT:         Joi.number().default(3001),
  NODE_ENV:     Joi.string().valid('development', 'production', 'test').default('development'),
  JWT_SECRET:   Joi.string().min(32).required(),
});
```

在 `AppModule` 中启用：

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: envValidationSchema,
})
```

---

### 2. 类型化配置工厂（进阶）

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

### 3. 建议的文件规划

```
config/
├── index.ts           # 统一导出所有配置工厂
├── env.config.ts      # Joi 校验 schema
├── database.config.ts # 数据库配置工厂
├── jwt.config.ts      # JWT 配置工厂
└── app.config.ts      # 应用级配置（端口、前缀等）
```

---

## 注意事项

- `.env` 文件已加入 `.gitignore`，请使用 `.env.example` 作为模板提交到仓库
- 生产环境应通过 CI/CD 注入环境变量，而非依赖 `.env` 文件
