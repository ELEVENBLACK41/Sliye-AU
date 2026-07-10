/**
 * 本文件定义认证、公开注册、邮箱验证、会话刷新和个人资料 HTTP 接口。
 */
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailVerificationDto } from './dto/send-email-verification.dto';
import { PasswordCryptoService } from './services/password-crypto.service';
import type {
  AuthenticatedRequest,
  AuthUserResponse,
  RequestClientMeta,
} from './types/auth.types';

/** 认证控制器；公开端点必须逐个使用 `@Public()` 显式声明。 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /** 注入认证业务服务和密码传输加密服务。 */
  constructor(
    private readonly authService: AuthService,
    private readonly passwordCryptoService: PasswordCryptoService,
  ) {}

  /** 下发密码传输加密所需的临时公钥和随机数。 */
  @Get('password-public-key')
  @Public()
  passwordPublicKey() {
    return this.passwordCryptoService.getPublicKey();
  }

  /** 处理公开注册请求并触发邮箱验证。 */
  @Post('register')
  @HttpCode(200)
  @Public()
  register(@Body() body: RegisterDto, @Req() request: Request) {
    return this.authService.register(body, this.getClientMeta(request));
  }

  /** 重新发送邮箱验证码，并由业务服务执行频率限制。 */
  @Post('email-verification/send')
  @HttpCode(200)
  @Public()
  sendEmailVerification(
    @Body() body: SendEmailVerificationDto,
    @Req() request: Request,
  ) {
    return this.authService.sendEmailVerification(
      body,
      this.getClientMeta(request),
    );
  }

  /** 确认邮箱验证码，并在成功后创建登录会话。 */
  @Post('email-verification/confirm')
  @HttpCode(200)
  @Public()
  confirmEmail(@Body() body: ConfirmEmailDto, @Req() request: Request) {
    return this.authService.confirmEmail(body, this.getClientMeta(request));
  }

  /** 校验账号密码并创建登录会话。 */
  @Post('login')
  @HttpCode(200)
  @Public()
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.authService.login(body, this.getClientMeta(request));
  }

  /** 使用一次性 refresh token 轮换并签发新令牌。 */
  @Post('refresh')
  @HttpCode(200)
  @Public()
  refresh(@Body() body: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(body, this.getClientMeta(request));
  }

  /** 查询当前登录用户的实时部门、角色和权限资料。 */
  @Get('profile')
  @ApiBearerAuth()
  profile(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  /** 查询当前登录用户资料的兼容别名接口。 */
  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  /** 注销当前访问令牌对应的服务端会话。 */
  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.auth!, this.getClientMeta(request));
  }

  /** 从请求头提取客户端 IP、User-Agent 和 requestId。 */
  private getClientMeta(request: Request): RequestClientMeta {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return {
      ipAddress: forwardedIp || request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.headers['x-request-id']?.toString(),
    };
  }
}
