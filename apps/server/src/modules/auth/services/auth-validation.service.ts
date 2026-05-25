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
  // 注入密码传输解密服务以解析加密后的登录注册密码。
  constructor(private readonly passwordCryptoService: PasswordCryptoService) {}

  // 解析注册请求并还原出可落库的注册输入。
  parseRegister(dto: RegisterDto): RegisterInput {
    const passwordCiphertext = this.parseRequiredString(dto.passwordCiphertext, 'passwordCiphertext');
    const passwordKeyId = this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId');

    // 先消耗 nonce + 校验密文去重，再解密密码——确保同一密文无法被重放
    this.passwordCryptoService.consumeNonce(
      this.parseRequiredString(dto.nonce, 'nonce'),
      passwordKeyId,
      passwordCiphertext,
    );

    const password = this.passwordCryptoService.decryptPassword(
      passwordCiphertext,
      passwordKeyId,
    );

    return {
      email: this.parseEmail(dto.email),
      password: this.parsePassword(password),
      name: this.parseOptionalName(dto.name),
    };
  }

  // 解析登录请求并还原出可校验的登录输入。
  parseLogin(dto: LoginDto): LoginInput {
    const passwordCiphertext = this.parseRequiredString(dto.passwordCiphertext, 'passwordCiphertext');
    const passwordKeyId = this.parseRequiredString(dto.passwordKeyId, 'passwordKeyId');

    // 先消耗 nonce + 校验密文去重，再解密密码——确保同一密文无法被重放
    this.passwordCryptoService.consumeNonce(
      this.parseRequiredString(dto.nonce, 'nonce'),
      passwordKeyId,
      passwordCiphertext,
    );

    const password = this.passwordCryptoService.decryptPassword(
      passwordCiphertext,
      passwordKeyId,
    );

    return {
      email: this.parseEmail(dto.email),
      password: this.parseRequiredString(password, 'password'),
    };
  }

  // 解析发送邮箱验证码请求中的邮箱。
  parseSendEmailVerification(dto: SendEmailVerificationDto): string {
    return this.parseEmail(dto.email);
  }

  // 解析邮箱验证码确认请求。
  parseConfirmEmail(dto: ConfirmEmailDto): ConfirmEmailInput {
    return {
      email: this.parseEmail(dto.email),
      code: this.parseVerificationCode(dto.code),
    };
  }

  // 解析 refresh token 请求体。
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

  // 校验并规范化邮箱地址。
  private parseEmail(value: unknown): string {
    const email = this.parseRequiredString(value, 'email').toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email.length > 254 || !emailPattern.test(email)) {
      throw new BadRequestException('Invalid email');
    }

    return email;
  }

  // 校验注册密码长度。
  private parsePassword(value: unknown): string {
    const password = this.parseRequiredString(value, 'password');

    if (password.length < 8 || password.length > 128) {
      throw new BadRequestException(
        'Password length must be between 8 and 128 characters',
      );
    }

    return password;
  }

  // 校验 6 位数字邮箱验证码。
  private parseVerificationCode(value: unknown): string {
    const code = this.parseRequiredString(value, 'code');

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid verification code');
    }

    return code;
  }

  // 校验可选用户名并返回规范化结果。
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

  // 校验必填字符串并去除首尾空白。
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
