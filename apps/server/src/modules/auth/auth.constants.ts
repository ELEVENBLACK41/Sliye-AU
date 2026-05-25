/*
 * @Author: shaoliye
 * @Date: 2026-05-22 11:51:35
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-25 16:54:19
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: Authentication module constants/日志审计事件常量
 * @Copyright: Copyright 1990 - 2026
 */
export const AUTH_DEFAULTS = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  emailCodeTtlSeconds: 10 * 60,
  emailCodeCooldownSeconds: 60,
  emailCodeMaxAttempts: 5,
} as const;

//日志审计事件常量
export const AUTH_AUDIT_EVENTS = {
  registerRequested: 'auth.register.requested',
  emailVerificationSent: 'auth.email_verification.sent',
  emailVerificationConfirmed: 'auth.email_verification.confirmed',
  loginSucceeded: 'auth.login.succeeded',
  loginFailed: 'auth.login.failed',
  tokenRefreshed: 'auth.token.refreshed',
  logoutSucceeded: 'auth.logout.succeeded',
} as const;
