export const AUTH_DEFAULTS = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  emailCodeTtlSeconds: 10 * 60,
  emailCodeCooldownSeconds: 60,
  emailCodeMaxAttempts: 5,
} as const;

export const AUTH_AUDIT_EVENTS = {
  registerRequested: 'auth.register.requested',
  emailVerificationSent: 'auth.email_verification.sent',
  emailVerificationConfirmed: 'auth.email_verification.confirmed',
  loginSucceeded: 'auth.login.succeeded',
  loginFailed: 'auth.login.failed',
  tokenRefreshed: 'auth.token.refreshed',
  logoutSucceeded: 'auth.logout.succeeded',
} as const;
