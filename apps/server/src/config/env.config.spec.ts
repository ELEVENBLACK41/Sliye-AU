/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 环境变量校验单元测试，保障服务启动配置的边界稳定
 * @Copyright: Copyright 1990 - 2026
 */
import { validateEnvConfig } from './env.config';

describe('validateEnvConfig', () => {
  it('returns defaults for optional development variables', () => {
    const config = validateEnvConfig({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.SERVER_API_PREFIX).toBe('api/v1');
    expect(config.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(config.AUTH_REFRESH_TOKEN_TTL_SECONDS).toBe(2592000);
  });

  it('normalizes api prefix slashes', () => {
    const config = validateEnvConfig({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      SERVER_API_PREFIX: '/api/v1/',
    });

    expect(config.SERVER_API_PREFIX).toBe('api/v1');
  });

  it('requires secrets in production', () => {
    expect(() =>
      validateEnvConfig({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
        NODE_ENV: 'production',
      }),
    ).toThrow('AUTH_ACCESS_TOKEN_SECRET is required in production');
  });

  it('rejects invalid positive integer variables', () => {
    expect(() =>
      validateEnvConfig({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
        PORT: 'abc',
      }),
    ).toThrow('PORT must be a positive integer');
  });
});
