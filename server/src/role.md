<!--
 * @Author: shaoliye
 * @Date: 2026-04-24 15:30:41
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 15:30:49
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
-->
server/
├── src/
│   ├── main.ts                    # 入口
│   ├── app.module.ts             # 根模块
│
│   ├── common/                   # 通用层（跨模块）
│   │   ├── decorators/           # 自定义装饰器
│   │   ├── guards/               # 权限守卫（RBAC）
│   │   ├── interceptors/         # 拦截器（日志/响应包装）
│   │   ├── filters/              # 异常过滤
│   │   ├── pipes/                # 参数校验
│   │   └── utils/                # 工具函数
│
│   ├── modules/                  # 核心（业务模块）
│   │   ├── auth/                 # 登录模块
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── dto/              # 入参定义
│   │   │   ├── entities/         # 数据模型
│   │   │   └── guards/           # auth专属守卫
│   │   │
│   │   ├── user/                 # 用户模块
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.module.ts
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   └── repository/       # 数据访问层（可选）
│   │   │
│   │   ├── audit/                # 审计日志（你亮点）
│   │   │   ├── audit.controller.ts
│   │   │   ├── audit.service.ts
│   │   │   ├── audit.module.ts
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   └── index.ts              # 模块统一导出
│
│   ├── config/                   # 配置层
│   │   ├── env.config.ts
│   │   ├── database.config.ts
│   │   └── index.ts
│
│   ├── database/                 # 数据库（未来）
│   │   ├── prisma/ or typeorm/
│   │   └── migrations/
│
│   └── types/                    # 全局类型
│       └── index.ts
│
├── package.json
├── tsconfig.json
└── nest-cli.json