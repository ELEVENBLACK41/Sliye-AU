import { ApiProperty } from '@nestjs/swagger';
import type { ConfirmEmailRequestPayload } from '@workspace/contracts/auth';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';

export class ConfirmEmailDto implements ConfirmEmailRequestPayload {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^\d{6}$/, { message: 'code must be a 6 digit number' })
  code!: string;
}
