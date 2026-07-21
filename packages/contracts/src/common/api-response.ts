/**
 * 本文件定义所有 HTTP API 共享的成功与失败响应契约。
 */

/** 所有成功响应使用的稳定业务码。 */
export const API_SUCCESS_CODE = 'COMMON.OK' as const;

/** 服务端可返回的稳定错误业务码目录。 */
export const API_ERROR_CODES = {
  COMMON_INTERNAL_ERROR: 'COMMON.INTERNAL_ERROR',
  COMMON_VALIDATION_FAILED: 'COMMON.VALIDATION_FAILED',
  COMMON_NOT_FOUND: 'COMMON.NOT_FOUND',
  AUTH_UNAUTHORIZED: 'AUTH.UNAUTHORIZED',
  AUTH_SESSION_EXPIRED: 'AUTH.SESSION_EXPIRED',
  AUTH_ACCOUNT_UNAVAILABLE: 'AUTH.ACCOUNT_UNAVAILABLE',
  ACCESS_PERMISSION_DENIED: 'ACCESS.PERMISSION_DENIED',
  ACCESS_DATA_SCOPE_DENIED: 'ACCESS.DATA_SCOPE_DENIED',
  ACCESS_SYSTEM_ROLE_PROTECTED: 'ACCESS.SYSTEM_ROLE_PROTECTED',
  ACCESS_LAST_SUPER_ADMIN_REQUIRED: 'ACCESS.LAST_SUPER_ADMIN_REQUIRED',
  ACCESS_GRANT_EXCEEDS_ACTOR: 'ACCESS.GRANT_EXCEEDS_ACTOR',
  DEPARTMENT_NOT_FOUND: 'DEPARTMENT.NOT_FOUND',
  DEPARTMENT_CODE_CONFLICT: 'DEPARTMENT.CODE_CONFLICT',
  DEPARTMENT_INVALID_PARENT: 'DEPARTMENT.INVALID_PARENT',
  DEPARTMENT_CYCLE_DETECTED: 'DEPARTMENT.CYCLE_DETECTED',
  DEPARTMENT_DISABLED: 'DEPARTMENT.DISABLED',
  DECISION_NOT_FOUND: 'DECISION.NOT_FOUND',
  DECISION_INVALID_STATUS_TRANSITION: 'DECISION.INVALID_STATUS_TRANSITION',
  DECISION_PARTICIPANT_USER_NOT_FOUND: 'DECISION.PARTICIPANT_USER_NOT_FOUND',
  DECISION_PARTICIPANT_ALREADY_EXISTS: 'DECISION.PARTICIPANT_ALREADY_EXISTS',
  DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED: 'DECISION.PARTICIPANT_CHANGE_NOT_ALLOWED',
  RESOURCE_CONFLICT: 'RESOURCE.CONFLICT',
} as const;

/** 由错误码目录派生的稳定错误业务码联合类型。 */
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** 请求参数或字段校验失败时返回的一条明细。 */
export type ApiErrorDetail = {
  /** 出错字段的路径；非字段级错误时可以省略。 */
  field?: string;
  /** 面向用户展示的中文错误说明。 */
  message: string;
  /** 触发错误的稳定校验规则名称。 */
  rule?: string;
};

/** API 成功响应。 */
export type ApiSuccessResponse<T> = {
  /** 标识本次请求成功，供调用方执行联合类型收窄。 */
  success: true;
  /** 所有成功响应统一使用的稳定业务码。 */
  code: typeof API_SUCCESS_CODE;
  /** 面向用户展示的中文结果说明。 */
  message: string;
  /** 接口返回的真实业务数据。 */
  data: T;
  /** 服务端生成响应时的 Unix 毫秒时间戳。 */
  timestamp: number;
  /** 贯穿服务端日志与本次响应的请求标识。 */
  requestId: string;
};

/** API 失败响应。 */
export type ApiErrorResponse = {
  /** 标识本次请求失败，供调用方执行联合类型收窄。 */
  success: false;
  /** 调用方可以稳定判断的字符串错误业务码。 */
  code: ApiErrorCode;
  /** 面向用户展示且不泄露内部实现的中文错误说明。 */
  message: string;
  /** 失败响应不携带业务数据，始终为 `null`。 */
  data: null;
  /** 参数或字段级错误明细；没有明细时省略。 */
  details?: ApiErrorDetail[];
  /** 服务端生成响应时的 Unix 毫秒时间戳。 */
  timestamp: number;
  /** 贯穿服务端日志与本次响应的请求标识。 */
  requestId: string;
  /** 产生错误的请求路径。 */
  path: string;
};

/** API 响应的可判别联合，调用方应通过 `success` 判断成功或失败。 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
