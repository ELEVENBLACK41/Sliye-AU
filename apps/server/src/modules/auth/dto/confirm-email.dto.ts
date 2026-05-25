import type { ConfirmEmailRequestPayload } from '@workspace/contracts/auth';

export class ConfirmEmailDto implements ConfirmEmailRequestPayload {
  email!: string;
  code!: string;
}
