/**
 * 本文件在 Jest 启动前把 apps/server/.env 中的变量注入 process.env。
 *
 * Jest 不会像 NestJS 的 ConfigModule 那样自动读取 .env，因此需要真实数据库的
 * 持久化测试原本只能靠命令行临时设置环境变量。这里只做最小补齐：
 * 已经存在的环境变量一律保持不变（命令行显式指定仍然优先），
 * 也不引入 dotenv 依赖，避免为测试增加运行时依赖。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 服务端本地环境变量文件路径。 */
const SERVER_ENV_FILE_PATH = join(__dirname, '..', '.env');

/** 去掉值两侧成对的引号，其他内容原样保留。 */
function stripSurroundingQuotes(value: string): string {
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");

  return (isDoubleQuoted || isSingleQuoted) && value.length >= 2
    ? value.slice(1, -1)
    : value;
}

/** 逐行解析 .env，只填补尚未设置的键。 */
function loadServerEnvFile(): void {
  if (!existsSync(SERVER_ENV_FILE_PATH)) {
    return;
  }

  for (const rawLine of readFileSync(SERVER_ENV_FILE_PATH, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripSurroundingQuotes(line.slice(separatorIndex + 1).trim());
  }
}

loadServerEnvFile();
