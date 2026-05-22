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
  constructor(
    private readonly authService: AuthService,
    private readonly passwordCryptoService: PasswordCryptoService,
  ) {}

  @Get('password-public-key')
  passwordPublicKey() {
    return this.passwordCryptoService.getPublicKey();
  }

  @Post('register')
  @HttpCode(200)
  register(@Body() body: RegisterDto, @Req() request: Request) {
    return this.authService.register(body, this.getClientMeta(request));
  }

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

  @Post('email-verification/confirm')
  @HttpCode(200)
  confirmEmail(@Body() body: ConfirmEmailDto, @Req() request: Request) {
    return this.authService.confirmEmail(body, this.getClientMeta(request));
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.authService.login(body, this.getClientMeta(request));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(body, this.getClientMeta(request));
  }

  @Get('profile')
  @UseGuards(AccessTokenGuard)
  profile(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: AuthUserResponse) {
    return this.authService.getProfile(user.id);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.auth!, this.getClientMeta(request));
  }

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
