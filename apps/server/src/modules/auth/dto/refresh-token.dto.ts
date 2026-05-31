import { ApiProperty } from '@nestjs/swagger';
import type { RefreshTokenRequestPayload } from '@workspace/contracts/auth';

export class RefreshTokenDto implements RefreshTokenRequestPayload {
  @ApiProperty({ example: 'opaque-refresh-token' })
  refreshToken!: string;
}
