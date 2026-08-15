/**
 * 本文件组装认证、权限守卫、授权服务和令牌相关依赖。
 */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PermissionGuard } from './guards/permission.guard';
import { AuthValidationService } from './services/auth-validation.service';
import { AvatarStorageService } from './services/avatar-storage.service';
import { AuthorizationService } from './services/authorization.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordCryptoService } from './services/password-crypto.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthValidationService,
    AvatarStorageService,
    AuthorizationService,
    PasswordCryptoService,
    PasswordService,
    TokenService,
    EmailVerificationService,
    AccessTokenGuard,
    PermissionGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    AuthorizationService,
    AccessTokenGuard,
    PermissionGuard,
  ],
})
/** 认证与授权模块，向其他业务模块导出统一授权能力。 */
export class AuthModule {}
