import { ApiProperty } from '@nestjs/swagger';
import type { ConfirmEmailRequestPayload } from '@workspace/contracts/auth';

export class ConfirmEmailDto implements ConfirmEmailRequestPayload {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: '123456' })
  code!: string;
}
