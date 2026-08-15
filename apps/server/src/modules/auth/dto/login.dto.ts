import { ApiProperty } from '@nestjs/swagger';
import type { LoginRequestPayload } from '@workspace/contracts/auth';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto implements LoginRequestPayload {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'base64-rsa-oaep-ciphertext' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  passwordCiphertext!: string;

  @ApiProperty({ example: 'password-key-id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  passwordKeyId!: string;
  /** 一次性随机数，由 GET /auth/password-public-key 返回，消耗后不可重放 */
  @ApiProperty({ example: 'one-time-nonce' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nonce!: string;
}
