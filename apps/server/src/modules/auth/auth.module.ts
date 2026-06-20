import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PermissionGuard } from './guards/permission.guard';
import { AuthValidationService } from './services/auth-validation.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordCryptoService } from './services/password-crypto.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthValidationService,
    PasswordCryptoService,
    PasswordService,
    TokenService,
    EmailVerificationService,
    AccessTokenGuard,
    PermissionGuard,
  ],
  exports: [AuthService, TokenService, AccessTokenGuard, PermissionGuard],
})
export class AuthModule {}
