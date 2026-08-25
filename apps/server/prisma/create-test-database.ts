/**
 * 本文件用于一次性创建 AI 集成测试所需的隔离 PostgreSQL 数据库。
 *
 * 集成测试的 `afterEach` 使用无条件 `deleteMany()` 清表，直接跑在开发库上
 * 会连同真实会话数据一起清空，因此必须使用独立数据库。
 * 脚本从 `.env` 的 `DATABASE_URL` 复用连接信息，只替换数据库名；
 * 数据库已存在时直接跳过，不会删除或覆盖任何既有数据。
 *
 * 用法：pnpm --filter @nextnest/server test:db:create
 * 创建后仍需执行 `prisma migrate deploy` 把表结构同步到该库。
 */

import 'dotenv/config';
import { Client } from 'pg';

/** 隔离测试库在开发库名称基础上追加的后缀。 */
const TEST_DATABASE_SUFFIX = '_test';

/** 解析开发库连接串，返回测试库名称与用于建库的管理连接串。 */
function resolveTargets(): {
  testDatabaseName: string;
  adminUrl: string;
  testUrl: string;
} {
  const rawUrl = process.env['DATABASE_URL'];
  if (!rawUrl) {
    throw new Error('未找到 DATABASE_URL，请先配置 apps/server/.env。');
  }

  const url = new URL(rawUrl);
  const developmentDatabaseName = decodeURIComponent(
    url.pathname.replace(/^\//, ''),
  );
  if (!developmentDatabaseName) {
    throw new Error('DATABASE_URL 中没有数据库名，无法推导测试库名称。');
  }
  if (developmentDatabaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `DATABASE_URL 已经指向测试库 ${developmentDatabaseName}，请改回开发库后再执行。`,
    );
  }

  const testDatabaseName = `${developmentDatabaseName}${TEST_DATABASE_SUFFIX}`;

  // 建库语句不能在目标库自身内执行，这里连到实例默认的 postgres 库。
  const adminUrl = new URL(rawUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const testUrl = new URL(rawUrl);
  testUrl.pathname = `/${encodeURIComponent(testDatabaseName)}`;

  return {
    testDatabaseName,
    adminUrl: adminUrl.toString(),
    testUrl: testUrl.toString(),
  };
}

/** 连接管理库并在测试库不存在时创建它。 */
async function createTestDatabase(): Promise<void> {
  const { testDatabaseName, adminUrl, testUrl } = resolveTargets();
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [testDatabaseName],
    );
    if (existing.rowCount === 1) {
      console.log(`测试库 ${testDatabaseName} 已存在，跳过创建。`);
    } else {
      // 数据库名不能作为参数绑定，这里用双引号包裹并转义内部双引号。
      await client.query(
        `CREATE DATABASE "${testDatabaseName.replace(/"/g, '""')}"`,
      );
      console.log(`已创建测试库 ${testDatabaseName}。`);
    }
  } finally {
    await client.end();
  }

  console.log('\n下一步：把表结构同步到测试库，并在跑集成测试时指定该库。');
  console.log('连接串（密码已隐藏）：');
  const masked = new URL(testUrl);
  masked.password = '***';
  console.log(`  ${masked.toString()}`);
}

void createTestDatabase().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
