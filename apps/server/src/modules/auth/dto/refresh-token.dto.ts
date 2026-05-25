import type { RefreshTokenRequestPayload } from '@workspace/contracts/auth';

export class RefreshTokenDto implements RefreshTokenRequestPayload {
  refreshToken!: string;
}
