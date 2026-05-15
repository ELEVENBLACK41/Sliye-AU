# src/app/api/test/users/

## 文件说明

### `route.ts` — GET /api/test/users

**功能**：代理转发到 NestJS `GET /test/users`，返回用户列表（含关联文章）。

**请求**：`GET /api/test/users`

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": 1,
      "email": "alice@example.com",
      "name": "Alice",
      "posts": [
        { "id": 1, "title": "Hello World", "content": "...", "published": true }
      ]
    }
  ],
  "timestamp": 1746000000000
}
```

**自动 seed**：若数据库 `User` 表为空，NestJS 服务会自动写入 3 条测试用户数据（含关联 Post），再返回查询结果。

**错误处理**：上游非 2xx 时返回 `{ code: httpStatus, message: "Upstream error", data: null }`。
