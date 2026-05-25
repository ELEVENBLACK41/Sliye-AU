import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailVerificationDto } from './dto/send-email-verification.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PasswordCryptoService } from './services/password-crypto.service';
import type {
  AuthenticatedRequest,
  AuthUserResponse,
  RequestClientMeta,
} from './types/auth.types';

@Controller('auth')
export class AuthController {
  // 注入认证服务和密码传输加密服务。
  constructor(
    private readonly authService: AuthService,
    private readonly passwordCryptoService: PasswordCryptoService,
  ) {}

  // 下发密码传输加密所需的临时公钥和 nonce。
  @Get('password-public-key')
  passwordPublicKey() {
    return this.passwordCryptoService.getPublicKey();
  }

  // 处理注册请求并触发邮箱验证。
  @Post('register')
  @HttpCode(200)
  register(@Body() body: RegisterDto, @Req() request: Request) {
    return this.authService.register(body, this.getClientMeta(request));
  }

  // 手动重新发送邮箱验证码。
  @Post('email-verification/send')
  @HttpCode(200)
  sendEmailVerification(
    @Body() body: SendEmailVerificationDto,
    @Req() request: Request,
  ) {
    return this.authService.sendEmailVerification(
      body,
      this.getClientMeta(request),
    );
  }

  // 确认邮箱验证码并在成功后创建登录会话。
  @Post('email-verification/confirm')
  @HttpCode(200)
  confirmEmail(@Body() body: ConfirmEmailDto, @Req() request: Request) {
    return this.authService.confirmEmail(body, this.getClientMeta(request));
  }

  // 校验账号密码并创建登录会话。
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.authService.login(body, this.getClientMeta(request));
  }

  // 使用 refresh token 轮换并签发新的访问令牌。
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(body, this.getClientMeta(request));
  }

  // 查询当前登录用户的个人资料。
  @Get('profile')
  @UseGuards(AccessTokenGuard)
  profile(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  // 查询当前登录用户的个人资料别名接口。
  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  // 注销当前访问令牌对应的登录会话。
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.auth!, this.getClientMeta(request));
  }

  // 从请求头中提取客户端 IP 和 User-Agent。
  private getClientMeta(request: Request): RequestClientMeta {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return {
      ipAddress: forwardedIp || request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
