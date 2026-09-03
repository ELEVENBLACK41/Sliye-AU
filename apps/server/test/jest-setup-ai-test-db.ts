/**
 * 本文件只为真实 PostgreSQL 集成测试注入 `AI_PERSISTENCE_TEST_DATABASE_URL`。
 *
 * Jest 不会自动读取 `.env`。2.4-L 移除了“把开发 `.env` 整体注入测试进程”的旧做法，
 * 因为那会让测试静默依赖开发配置；但把测试库连接串写进 `.env` 又是最自然的用法。
 * 这里取折中：**只读取这一个变量**，不注入 `DATABASE_URL` 或任何其他配置。
 *
 * 同时强制一条安全约束：集成测试的清理钩子会无条件清空 AI 相关表，
 * 一旦它连到开发库就会删除真实会话数据，因此这里在测试库与开发库
 * 指向同一个数据库时直接抛错终止，而不是让测试“看起来正常地”跑起来。
 *
 * 命令行显式设置的值优先，本文件不覆盖。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 服务端本地环境变量文件路径。 */
const SERVER_ENV_FILE_PATH = join(__dirname, '..', '.env');

/** 集成测试连接串的变量名。 */
const TEST_DATABASE_URL_KEY = 'AI_PERSISTENCE_TEST_DATABASE_URL';

/** 开发库连接串的变量名，仅用于安全比对，不会被注入测试进程。 */
const DEVELOPMENT_DATABASE_URL_KEY = 'DATABASE_URL';

/** 从 `.env` 中读取指定键，去掉值两侧成对引号；不存在时返回 undefined。 */
function readEnvValue(envText: string, key: string): string | undefined {
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0 || line.slice(0, separatorIndex).trim() !== key) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    const isQuoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));

    return isQuoted ? value.slice(1, -1) : value;
  }

  return undefined;
}

/** 提取用于判断“是否同一个数据库”的稳定标识：主机、端口与库名。 */
function toDatabaseIdentity(url: string): string | null {
  try {
    const parsed = new URL(url);

    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/** 测试库与开发库指向同一个数据库时立即终止，避免清空真实数据。 */
function assertNotDevelopmentDatabase(
  testUrl: string,
  developmentUrl: string | undefined,
): void {
  if (!developmentUrl) {
    // 读不到开发库连接串就无法比对，此时保持可运行但必须明确提示，不静默放行。
    console.warn(
      `[jest-setup] 未找到 ${DEVELOPMENT_DATABASE_URL_KEY}，无法校验 ${TEST_DATABASE_URL_KEY} 是否误指向开发库。`,
    );

    return;
  }

  const testIdentity = toDatabaseIdentity(testUrl);
  if (
    testIdentity !== null &&
    testIdentity === toDatabaseIdentity(developmentUrl)
  ) {
    throw new Error(
      `${TEST_DATABASE_URL_KEY} 与 ${DEVELOPMENT_DATABASE_URL_KEY} 指向同一个数据库。` +
        'AI 持久化集成测试会无条件清空 AI 相关表，必须使用独立测试库。' +
        '可执行 pnpm --filter @nextnest/server test:db:create 创建。',
    );
  }
}

/** 按上述规则补齐并校验集成测试连接串。 */
function loadAiTestDatabaseUrl(): void {
  const envText = existsSync(SERVER_ENV_FILE_PATH)
    ? readFileSync(SERVER_ENV_FILE_PATH, 'utf8')
    : '';
  const developmentUrl =
    readEnvValue(envText, DEVELOPMENT_DATABASE_URL_KEY) ??
    process.env[DEVELOPMENT_DATABASE_URL_KEY];
  const testUrl =
    process.env[TEST_DATABASE_URL_KEY] ??
    readEnvValue(envText, TEST_DATABASE_URL_KEY);

  if (!testUrl) {
    return;
  }

  assertNotDevelopmentDatabase(testUrl, developmentUrl);
  process.env[TEST_DATABASE_URL_KEY] = testUrl;
}

loadAiTestDatabaseUrl();
