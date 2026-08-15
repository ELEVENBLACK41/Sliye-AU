import { ApiProperty } from '@nestjs/swagger';
import type { RefreshTokenRequestPayload } from '@workspace/contracts/auth';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto implements RefreshTokenRequestPayload {
  @ApiProperty({ example: 'opaque-refresh-token' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken!: string;
}
