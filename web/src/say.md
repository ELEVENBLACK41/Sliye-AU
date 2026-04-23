apps/web/
├── app/                                # Next.js App Router（路由层）
│   ├── (auth)/                         # 登录注册模块分组
│   │   ├── login/
│   │   │   ├── page.tsx                # 登录页面
│   │   │   └── layout.tsx              # 登录页专属布局（无sidebar）
│   │   ├── register/
│   │   │   └── page.tsx                # 注册页面
│   │   └── layout.tsx                  # auth模块公共布局
│   │
│   ├── (dashboard)/                    # 后台系统模块分组
│   │   ├── user/
│   │   │   └── page.tsx                # 用户管理页面
│   │   ├── audit/
│   │   │   └── page.tsx                # 审计日志页面
│   │   ├── settings/
│   │   │   └── page.tsx                # 系统设置页面
│   │   └── layout.tsx                  # 后台布局（sidebar/header）
│   │
│   ├── api/                            # BFF API层（Next Route Handlers）
│   │   ├── user/
│   │   │   └── route.ts                # 用户接口聚合层（BFF）
│   │   ├── auth/
│   │   │   └── route.ts                # 登录/鉴权BFF
│   │   └── audit/
│   │       └── route.ts                # 审计日志BFF
│   │
│   ├── layout.tsx                      # 全局布局（html/body）
│   └── page.tsx                        # 首页
│
├── features/                           # 业务模块（核心架构）
│   ├── auth/                           # 登录模块
│   │   ├── components/                 # 登录相关UI组件
│   │   ├── hooks/                      # 业务hooks（如useLogin）
│   │   ├── services/                   # 登录API调用
│   │   ├── store/                      # auth相关zustand
│   │   ├── types/                      # 登录模块类型
│   │   └── index.ts                    # 模块出口
│   │
│   ├── user/                           # 用户模块
│   │   ├── components/                 # 用户列表/详情组件
│   │   ├── hooks/                      # useUser等
│   │   ├── services/                   # 用户API封装
│   │   ├── store/                      # 用户状态管理
│   │   ├── types/                      # UserDTO等
│   │   └── index.ts
│   │
│   ├── audit/                          # 审计模块（你未来亮点）
│   │   ├── components/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── index.ts
│
├── components/                         # 全局通用组件（无业务）
│   ├── ui/                             # 基础UI组件
│   │   ├── Button.tsx                  # 按钮
│   │   ├── Input.tsx                   # 输入框
│   │   ├── Modal.tsx                   # 弹窗
│   │   ├── Table.tsx                   # 表格
│   │   └── index.ts                    # 导出
│   │
│   ├── layout/                         # 页面布局组件
│   │   ├── Sidebar.tsx                 # 侧边栏
│   │   ├── Header.tsx                  # 顶部栏
│   │   └── LayoutShell.tsx             # 主布局壳
│   │
│   ├── feedback/                       # 交互反馈组件
│   │   ├── Toast.tsx                   # 提示
│   │   ├── Loading.tsx                 # 加载
│   │   └── ErrorBoundary.tsx           # 错误边界
│
├── store/                              # 全局状态（跨模块）
│   ├── auth.store.ts                   # 登录状态（user/token）
│   ├── app.store.ts                    # 全局UI状态（theme/sidebar）
│   └── index.ts                        # store统一导出
│
├── services/                           # BFF请求层（统一入口）
│   ├── request.ts                      # fetch封装（拦截/错误处理）
│   ├── user.service.ts                 # 用户API调用
│   ├── auth.service.ts                 # 登录API调用
│   └── audit.service.ts                # 审计API调用
│
├── hooks/                              # 通用hooks（无业务）
│   ├── useDebounce.ts                  # 防抖
│   ├── usePermission.ts                # 权限判断
│   ├── usePagination.ts                # 分页逻辑
│   └── index.ts
│
├── lib/                                # 工具库
│   ├── utils.ts                        # 通用工具函数
│   ├── constants.ts                    # 常量
│   ├── env.ts                          # 环境变量封装
│   └── date.ts                         # 日期工具
│
├── types/                              # 前端全局类型
│   ├── global.d.ts                     # 全局类型扩展
│   ├── api.ts                          # API统一返回结构
│   └── index.ts
│
├── styles/                             # 样式
│   ├── globals.css                     # 全局样式
│   ├── variables.css                   # CSS变量
│   └── theme.css                       # 主题
│
├── middleware.ts                       # Next中间件（权限/拦截）
├── next.config.js                      # Next配置
└── tsconfig.json                       # TS配置