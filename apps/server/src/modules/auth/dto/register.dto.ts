export class RegisterDto {
  email!: string;
  passwordCiphertext!: string;
  passwordKeyId!: string;
  name?: string;
}
