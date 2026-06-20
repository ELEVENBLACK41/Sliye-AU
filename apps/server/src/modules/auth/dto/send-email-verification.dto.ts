import { ApiProperty } from '@nestjs/swagger';
import type { SendEmailVerificationRequestPayload } from '@workspace/contracts/auth';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class SendEmailVerificationDto implements SendEmailVerificationRequestPayload {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
