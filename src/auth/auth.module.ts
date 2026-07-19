import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthSessionCacheService } from './services/auth-session-cache.service';
import { EmailService } from './services/email.service';
import { MailQueueService } from './services/mail-queue.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { AuthChallengeService } from './services/auth-challenge.service';
import { TokenRevocationService } from './services/token-revocation.service';
import { TwoFactorSetupGuard } from './guards/two-factor-setup.guard';
import { TwoFactorVerificationGuard } from './guards/two-factor-verification.guard';
import { TwoFactorRecoveryGuard } from './guards/two-factor-recovery.guard';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 50 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET')?.trim();
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        return {
          secret,
          signOptions: { expiresIn: '1h' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    AuthSessionCacheService,
    AuthChallengeService,
    TokenRevocationService,
    MailQueueService,
    EmailService,
    TwoFactorAuthService,
    TwoFactorSetupGuard,
    TwoFactorVerificationGuard,
    TwoFactorRecoveryGuard,
  ],
  exports: [
    AuthService,
    AuthSessionCacheService,
    TwoFactorAuthService,
    EmailService,
    MailQueueService,
    TokenRevocationService,
  ],
})
export class AuthModule {}
