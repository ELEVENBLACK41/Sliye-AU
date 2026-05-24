import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfirmEmailDto } from '../dto/confirm-email.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { SendEmailVerificationDto } from '../dto/send-email-verification.dto';
import { PasswordCryptoService } from './password-crypto.service';

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ConfirmEmailInput {
  email: string;
  code: string;
}

@Injectable()
export class AuthValidationService {
  constructor(private readonly passwordCryptoService: PasswordCryptoService) {}

  parseRegister(dto: RegisterDto): RegisterInput {
    // 先消耗 nonce，再解密密码——确保同一密文无法被重放
    this.passwordCryptoService.consumeNonce(
      this.parseRequiredString(dto.nonce, 'nonce'),
      this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId'),
    );

    const password = this.passwordCryptoService.decryptPassword(
      this.parseRequiredString(dto.passwordCiphertext, 'passwordCiphertext'),
      this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId'),
    );

    return {
      email: this.parseEmail(dto.email),
      password: this.parsePassword(password),
      name: this.parseOptionalName(dto.name),
    };
  }

  parseLogin(dto: LoginDto): LoginInput {
    // 先消耗 nonce，再解密密码——确保同一密文无法被重放
    this.passwordCryptoService.consumeNonce(
      this.parseRequiredString(dto.nonce, 'nonce'),
      this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId'),
    );

    const password = this.passwordCryptoService.decryptPassword(
      this.parseRequiredString(dto.passwordCiphertext, 'passwordCiphertext'),
      this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId'),
    );

    return {
      email: this.parseEmail(dto.email),
      password: this.parseRequiredString(password, 'password'),
    };
  }

  parseSendEmailVerification(dto: SendEmailVerificationDto): string {
    return this.parseEmail(dto.email);
  }

  parseConfirmEmail(dto: ConfirmEmailDto): ConfirmEmailInput {
    return {
      email: this.parseEmail(dto.email),
      code: this.parseVerificationCode(dto.code),
    };
  }

  parseRefreshToken(dto: RefreshTokenDto): string {
    const refreshToken = this.parseRequiredString(
      dto.refreshToken,
      'refreshToken',
    );

    if (refreshToken.length < 32 || refreshToken.length > 256) {
      throw new BadRequestException('Invalid refreshToken');
    }

    return refreshToken;
  }

  private parseEmail(value: unknown): string {
    const email = this.parseRequiredString(value, 'email').toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email.length > 254 || !emailPattern.test(email)) {
      throw new BadRequestException('Invalid email');
    }

    return email;
  }

  private parsePassword(value: unknown): string {
    const password = this.parseRequiredString(value, 'password');

    if (password.length < 8 || password.length > 128) {
      throw new BadRequestException(
        'Password length must be between 8 and 128 characters',
      );
    }

    return password;
  }

  private parseVerificationCode(value: unknown): string {
    const code = this.parseRequiredString(value, 'code');

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid verification code');
    }

    return code;
  }

  private parseOptionalName(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const name = this.parseRequiredString(value, 'name');

    if (name.length > 40) {
      throw new BadRequestException('Name must be 40 characters or less');
    }

    return name;
  }

  private parseRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }
}
