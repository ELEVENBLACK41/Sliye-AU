export class LoginDto {
  email!: string;
  passwordCiphertext!: string;
  passwordKeyId!: string;
  /** 一次性随机数，由 GET /auth/password-public-key 返回，消耗后不可重放 */
  nonce!: string;
}
