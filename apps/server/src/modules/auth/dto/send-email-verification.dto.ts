import type { SendEmailVerificationRequestPayload } from '@workspace/contracts/auth';

export class SendEmailVerificationDto
  implements SendEmailVerificationRequestPayload
{
  email!: string;
}
