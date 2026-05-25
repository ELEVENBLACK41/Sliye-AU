# Auth module

Provides email/password auth for the Next.js web app through the BFF layer.

## API contract

All responses are wrapped by the global interceptor:

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": 1778041000929
}
```

### POST `/auth/register`

Creates a pending user, stores a scrypt password hash, and prints a six digit email verification code in Nest logs.

Passwords are transported with application-level RSA-OAEP encryption in addition to HTTPS. Get the current key from `GET /auth/password-public-key`, encrypt the raw password in the browser, and submit `passwordCiphertext` plus `passwordKeyId`.

Request:

```json
{
  "email": "user@example.com",
  "passwordCiphertext": "base64-rsa-oaep-ciphertext",
  "passwordKeyId": "key-id",
  "name": "Sliye"
}
```

Response data:

```json
{
  "user": {},
  "emailVerification": {
    "required": true,
    "sentTo": "user@example.com",
    "expiresAt": "2026-05-22T03:20:00.000Z",
    "cooldownSeconds": 60
  }
}
```

### POST `/auth/email-verification/confirm`

Consumes the latest verification code, activates the user, and returns an auth session.

Request:

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Response data:

```json
{
  "user": {},
  "tokens": {
    "tokenType": "Bearer",
    "accessToken": "jwt",
    "accessTokenExpiresAt": "2026-05-22T03:25:00.000Z",
    "accessTokenExpiresIn": 900,
    "refreshToken": "opaque-token",
    "refreshTokenExpiresAt": "2026-05-29T03:10:00.000Z",
    "refreshTokenExpiresIn": 604800
  }
}
```

### POST `/auth/login`

Returns the same auth session shape as email confirmation. If the account is still pending, a fresh verification code is printed in Nest logs and the request returns `403`.

Request:

```json
{
  "email": "user@example.com",
  "passwordCiphertext": "base64-rsa-oaep-ciphertext",
  "passwordKeyId": "key-id"
}
```

### POST `/auth/refresh`

Rotates the refresh token and returns a new access token plus a new refresh token.

Request:

```json
{
  "refreshToken": "opaque-token"
}
```

### GET `/auth/profile` and GET `/auth/me`

Require `Authorization: Bearer <accessToken>` and return the current user.

### POST `/auth/logout`

Requires `Authorization: Bearer <accessToken>`, revokes the current session, and revokes all refresh tokens under that session.

## Next.js BFF notes

- The browser should call Next route handlers, for example `/api/auth/login`.
- The Next BFF should call Nest with `NEST_BASE_URL`, pass request JSON through, and forward Nest's wrapped response without wrapping it a second time.
- Store tokens in HTTP-only cookies on the Next side. Nest intentionally returns tokens as JSON so Server Components, Server Actions, and Route Handlers can own cookie policy.
- For protected BFF routes, read the access token from the HTTP-only cookie and forward it to Nest as `Authorization: Bearer <accessToken>`.
- When Nest returns `401`, the BFF can call `/auth/refresh` with the refresh token cookie, set the rotated cookies, and retry the original request once.

## Environment variables

| Name | Default | Description |
| --- | --- | --- |
| `AUTH_ACCESS_TOKEN_SECRET` | dev fallback | HMAC secret for access tokens. Set in every non-local environment. |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime. |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `604800` | Refresh token and session lifetime. |
| `AUTH_EMAIL_CODE_SECRET` | dev fallback | Pepper for hashing six digit email codes. |
| `AUTH_EMAIL_CODE_TTL_SECONDS` | `600` | Email verification code lifetime. |
| `AUTH_EMAIL_CODE_COOLDOWN_SECONDS` | `60` | Manual resend cooldown. |
| `AUTH_EMAIL_CODE_MAX_ATTEMPTS` | `5` | Max attempts for the latest code. |
