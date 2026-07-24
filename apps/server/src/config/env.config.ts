/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 服务端环境变量校验与默认值收敛，避免缺失配置延迟到运行时报错
 * @Copyright: Copyright 1990 - 2026
 */
export type AppEnvironment = 'development' | 'production' | 'test';

export interface ServerEnvConfig {
  DATABASE_URL: string;
  NODE_ENV: AppEnvironment;
  PORT: number;
  SERVER_API_PREFIX: string;
  AUTH_ACCESS_TOKEN_SECRET?: string;
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_REFRESH_TOKEN_TTL_SECONDS: number;
  AUTH_EMAIL_CODE_SECRET?: string;
  AUTH_EMAIL_CODE_TTL_SECONDS: number;
  AUTH_EMAIL_CODE_COOLDOWN_SECONDS: number;
  AUTH_EMAIL_CODE_MAX_ATTEMPTS: number;
  CHAT_SOCKET_TICKET_SECRET?: string;
  CHAT_SOCKET_TICKET_TTL_SECONDS: number;
  AVATAR_UPLOAD_DIR: string;
  WEB_ORIGINS: string[];
}

const DEFAULT_PORT = 3001;
const DEFAULT_API_PREFIX = 'api/v1';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_EMAIL_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_EMAIL_CODE_COOLDOWN_SECONDS = 60;
const DEFAULT_EMAIL_CODE_MAX_ATTEMPTS = 5;
const DEFAULT_CHAT_SOCKET_TICKET_TTL_SECONDS = 5 * 60;
const DEFAULT_AVATAR_UPLOAD_DIR = './uploads/avatars';
const DEFAULT_WEB_ORIGINS = ['http://localhost:3000'];

// 校验 ConfigModule 读取到的环境变量，并返回带默认值的强类型配置对象。
export function validateEnvConfig(
  config: Record<string, unknown>,
): ServerEnvConfig {
  const errors: string[] = [];
  const nodeEnv = readEnvironment(config.NODE_ENV, errors);
  const accessSecret = readOptionalSecret(
    config.AUTH_ACCESS_TOKEN_SECRET,
    'AUTH_ACCESS_TOKEN_SECRET',
    nodeEnv,
    errors,
  );
  const emailCodeSecret = readOptionalSecret(
    config.AUTH_EMAIL_CODE_SECRET,
    'AUTH_EMAIL_CODE_SECRET',
    nodeEnv,
    errors,
  );
  const chatSocketTicketSecret = readOptionalSecret(
    config.CHAT_SOCKET_TICKET_SECRET,
    'CHAT_SOCKET_TICKET_SECRET',
    nodeEnv,
    errors,
  );

  const envConfig: ServerEnvConfig = {
    DATABASE_URL: readRequiredString(
      config.DATABASE_URL,
      'DATABASE_URL',
      errors,
    ),
    NODE_ENV: nodeEnv,
    PORT: readPositiveInteger(config.PORT, 'PORT', DEFAULT_PORT, errors),
    SERVER_API_PREFIX: normalizeApiPrefix(
      readOptionalString(
        config.SERVER_API_PREFIX,
        'SERVER_API_PREFIX',
        DEFAULT_API_PREFIX,
        errors,
      ),
    ),
    AUTH_ACCESS_TOKEN_SECRET: accessSecret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: readPositiveInteger(
      config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      errors,
    ),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: readPositiveInteger(
      config.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      'AUTH_REFRESH_TOKEN_TTL_SECONDS',
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      errors,
    ),
    AUTH_EMAIL_CODE_SECRET: emailCodeSecret,
    AUTH_EMAIL_CODE_TTL_SECONDS: readPositiveInteger(
      config.AUTH_EMAIL_CODE_TTL_SECONDS,
      'AUTH_EMAIL_CODE_TTL_SECONDS',
      DEFAULT_EMAIL_CODE_TTL_SECONDS,
      errors,
    ),
    AUTH_EMAIL_CODE_COOLDOWN_SECONDS: readPositiveInteger(
      config.AUTH_EMAIL_CODE_COOLDOWN_SECONDS,
      'AUTH_EMAIL_CODE_COOLDOWN_SECONDS',
      DEFAULT_EMAIL_CODE_COOLDOWN_SECONDS,
      errors,
    ),
    AUTH_EMAIL_CODE_MAX_ATTEMPTS: readPositiveInteger(
      config.AUTH_EMAIL_CODE_MAX_ATTEMPTS,
      'AUTH_EMAIL_CODE_MAX_ATTEMPTS',
      DEFAULT_EMAIL_CODE_MAX_ATTEMPTS,
      errors,
    ),
    CHAT_SOCKET_TICKET_SECRET: chatSocketTicketSecret,
    CHAT_SOCKET_TICKET_TTL_SECONDS: readPositiveInteger(
      config.CHAT_SOCKET_TICKET_TTL_SECONDS,
      'CHAT_SOCKET_TICKET_TTL_SECONDS',
      DEFAULT_CHAT_SOCKET_TICKET_TTL_SECONDS,
      errors,
    ),
    AVATAR_UPLOAD_DIR: readOptionalString(
      config.AVATAR_UPLOAD_DIR,
      'AVATAR_UPLOAD_DIR',
      DEFAULT_AVATAR_UPLOAD_DIR,
      errors,
    ),
    WEB_ORIGINS: readWebOrigins(config.WEB_ORIGINS, errors),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${errors.join('; ')}`);
  }

  return envConfig;
}

// 读取逗号分隔的 Web Origin 白名单，并标准化为不带路径的 HTTP(S) Origin。
function readWebOrigins(value: unknown, errors: string[]): string[] {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_WEB_ORIGINS;
  }

  if (typeof value !== 'string') {
    errors.push('WEB_ORIGINS must be a comma-separated string');
    return DEFAULT_WEB_ORIGINS;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeWebOrigin(origin, errors));
  const validOrigins = origins.filter(
    (origin): origin is string => origin !== null,
  );

  if (validOrigins.length === 0) {
    errors.push('WEB_ORIGINS must contain at least one valid origin');
    return DEFAULT_WEB_ORIGINS;
  }

  return [...new Set(validOrigins)];
}

// 校验并标准化单个浏览器 Origin，禁止通配符和附带业务路径的地址。
function normalizeWebOrigin(value: string, errors: string[]): string | null {
  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.origin === 'null' ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid web origin');
    }

    return url.origin;
  } catch {
    errors.push(`WEB_ORIGINS contains invalid origin: ${value}`);
    return null;
  }
}

// 读取必填字符串配置。
function readRequiredString(
  value: unknown,
  key: string,
  errors: string[],
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} is required`);
    return '';
  }

  return value.trim();
}

// 读取可选字符串配置。
function readOptionalString(
  value: unknown,
  key: string,
  fallback: string,
  errors: string[],
): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    errors.push(`${key} must be a string`);
    return fallback;
  }

  return value.trim();
}

// 读取正整数配置，缺省时使用默认值，非法时阻止应用启动。
function readPositiveInteger(
  value: unknown,
  key: string,
  fallback: number,
  errors: string[],
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    errors.push(`${key} must be a positive integer`);
    return fallback;
  }

  return numberValue;
}

// 读取运行环境并限制到项目支持的枚举范围。
function readEnvironment(value: unknown, errors: string[]): AppEnvironment {
  if (value === undefined || value === null || value === '') {
    return 'development';
  }

  if (value === 'development' || value === 'production' || value === 'test') {
    return value;
  }

  errors.push('NODE_ENV must be one of development, production, test');
  return 'development';
}

// 读取安全密钥；生产环境必须显式配置，开发环境允许服务内部 fallback。
function readOptionalSecret(
  value: unknown,
  key: string,
  nodeEnv: AppEnvironment,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (nodeEnv === 'production') {
      errors.push(`${key} is required in production`);
    }

    return undefined;
  }

  if (typeof value !== 'string' || value.length < 32) {
    errors.push(`${key} must be at least 32 characters`);
    return undefined;
  }

  return value;
}

// 标准化全局 API 前缀，避免配置中首尾斜杠导致路径重复。
function normalizeApiPrefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, '') || DEFAULT_API_PREFIX;
}
