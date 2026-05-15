# src/app/api/test/

测试模块 BFF API Routes。

## 文件说明

### `route.ts` — GET /api/test

**功能**：代理转发到 NestJS `GET /test`，返回测试问候语。

**请求**：`GET /api/test`

**响应**（来自 NestJS `TransformInterceptor` 封装）：
```json
{
  "code": 0,
  "message": "success",
  "data": { "msg": "Hello World!" },
  "timestamp": 1746000000000
}
```

**错误处理**：上游非 2xx 时返回 `{ code: httpStatus, message: "Upstream error", data: null }`。

---

## 子目录

### `users/` → `GET /api/test/users`

详见 [`users/README.md`](users/README.md)
