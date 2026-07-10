/**
 * API 统一响应常量。
 *
 * 本文件只保留服务端展示文案，并转发 contracts 中的稳定业务码，避免服务端与前端各自维护一套响应码。
 */

export { API_ERROR_CODES, API_SUCCESS_CODE } from '@workspace/contracts/common';

/** API 成功响应的默认中文文案。 */
export const API_SUCCESS_MESSAGE = '请求成功';
