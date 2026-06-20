/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 健康检查接口返回结构类型，便于后续接入监控和部署平台
 * @Copyright: Copyright 1990 - 2026
 */
export type HealthStatus = 'ok' | 'error';

export interface HealthCheckResponse {
  status: HealthStatus;
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessCheckResponse extends HealthCheckResponse {
  database: HealthStatus;
}
