import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RegisterRequestPayload } from '@workspace/contracts/auth';

export class RegisterDto implements RegisterRequestPayload {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'base64-rsa-oaep-ciphertext' })
  passwordCiphertext!: string;

  @ApiProperty({ example: 'password-key-id' })
  passwordKeyId!: string;
/** 一次性随机数，由 GET /auth/password-public-key 返回，消耗后不可重放 */
  @ApiProperty({ example: 'one-time-nonce' })
  nonce!: string;

  @ApiPropertyOptional({ example: 'Sliye' })
  name?: string;
}
