import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailService } from './services/email.service';
import { MailQueueService } from './services/mail-queue.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { TwoFactorSetupGuard } from './guards/two-factor-setup.guard';
import { TwoFactorVerificationGuard } from './guards/two-factor-verification.guard';
import { TwoFactorRecoveryGuard } from './guards/two-factor-recovery.guard';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuthService,
    LocalStrategy,
    JwtStrategy,
    GoogleStrategy,
    TokenBlacklistService,
    MailQueueService,
    EmailService,
    TwoFactorAuthService,
    TwoFactorSetupGuard,
    TwoFactorVerificationGuard,
    TwoFactorRecoveryGuard,
  ],
  exports: [AuthService, TokenBlacklistService, TwoFactorAuthService, EmailService, MailQueueService],
})
export class AuthModule {}
