import { ApiProperty } from '@nestjs/swagger';
import type { SendEmailVerificationRequestPayload } from '@workspace/contracts/auth';

export class SendEmailVerificationDto
  implements SendEmailVerificationRequestPayload
{
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
}
