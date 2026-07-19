import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { AuthChallengeService } from './auth-challenge.service';
import { decryptSecret, encryptSecret } from '../utils/secret-crypto';

@Injectable()
export class TwoFactorAuthService {
  private readonly logger = new Logger(TwoFactorAuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly challengeService: AuthChallengeService,
  ) {}

  async generateTOTPSecret(email: string): Promise<{ secret: string; qrCode: string }> {
    const secret = speakeasy.generateSecret({
      name: `BCN Profiles (${email})`,
      issuer: 'BCN Profiles',
      length: 32,
    });

    const qrCodeUrl = secret.otpauth_url || '';
    const qrCode = await QRCode.toDataURL(qrCodeUrl);

    return {
      secret: secret.base32 || '',
      qrCode: qrCode || '',
    };
  }

  async verifyTOTPCode(secret: string, code: string): Promise<boolean> {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
  }

  async generateBackupCodes(count: number = 10): Promise<string[]> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += alphabet[randomInt(alphabet.length)];
      }
      codes.push(code);
    }
    return codes;
  }

  async hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
  }

  async verifyBackupCode(plainCode: string, hashedCode: string): Promise<boolean> {
    return bcrypt.compare(plainCode, hashedCode);
  }

  async enableTwoFactor(userId: string, totpSecret: string): Promise<void> {
    const existing = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { metadata: true },
    });

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        totpSecret: encryptSecret(totpSecret),
        metadata: {
          ...existingMetadata,
          twoFactorEnabledAt: new Date().toISOString(),
        },
      },
    });
  }

  async disableTwoFactor(userId: string, reason?: string): Promise<void> {
    const existing = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { metadata: true },
    });

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          totpSecret: null,
          metadata: {
            ...existingMetadata,
            twoFactorDisabledAt: new Date().toISOString(),
            twoFactorDisabledReason: reason || 'User requested reset',
          },
        },
      }),
      this.prismaService.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prismaService.authChallenge.deleteMany({
        where: {
          userId,
          type: { in: ['setup-2fa', 'verify-2fa', 'recovery-2fa'] },
          usedAt: null,
        },
      }),
    ]);
  }

  async getUnusedBackupCodes(userId: string): Promise<string[]> {
    const codes = await this.prismaService.twoFactorRecoveryCode.findMany({
      where: { userId, isUsed: false },
      select: { code: true },
    });
    return codes.map((c) => c.code);
  }

  async markBackupCodeAsUsed(userId: string, plainCode: string): Promise<boolean> {
    const unusedCodes = await this.prismaService.twoFactorRecoveryCode.findMany({
      where: { userId, isUsed: false },
      select: { id: true, code: true },
    });

    for (const codeRecord of unusedCodes) {
      const isMatch = await this.verifyBackupCode(plainCode, codeRecord.code);
      if (!isMatch) continue;

      const updated = await this.prismaService.twoFactorRecoveryCode.updateMany({
        where: { id: codeRecord.id, isUsed: false },
        data: { isUsed: true, usedAt: new Date() },
      });
      return updated.count === 1;
    }

    return false;
  }

  async generateAndSendEmailOTP(email: string): Promise<void> {
    const otp = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prismaService.passwordReset.create({
      data: {
        id: `2fa-email-${randomUUID()}`,
        email,
        otp: otpHash,
        expiresAt,
        isUsed: false,
      },
    });

    void this.emailService.sendTwoFactorOTP(email, otp).catch((error) => {
      this.logger.error(
        'Failed to send 2FA OTP email in background',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  async verifyEmailOTP(email: string, otp: string): Promise<boolean> {
    const records = await this.prismaService.passwordReset.findMany({
      where: {
        email,
        isUsed: false,
        expiresAt: { gt: new Date() },
        id: { startsWith: '2fa-email-' },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const record of records) {
      const match = await bcrypt.compare(otp, record.otp);
      if (!match) continue;

      const updated = await this.prismaService.passwordReset.updateMany({
        where: { id: record.id, isUsed: false },
        data: { isUsed: true },
      });
      return updated.count === 1;
    }

    // Backward-compat: older plaintext OTP rows
    const legacy = await this.prismaService.passwordReset.findFirst({
      where: {
        email,
        otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (!legacy) return false;

    const updated = await this.prismaService.passwordReset.updateMany({
      where: { id: legacy.id, isUsed: false },
      data: { isUsed: true },
    });
    return updated.count === 1;
  }

  async validatePassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user?.password) return false;
    return bcrypt.compare(password, user.password);
  }

  generateSetupToken(userId: string, email: string): Promise<string> {
    return this.challengeService.issue('setup-2fa', userId, email, 15 * 60);
  }

  generateSetupTokenWithSecret(
    userId: string,
    email: string,
    secret: string,
  ): Promise<string> {
    return this.challengeService.issue('setup-2fa', userId, email, 15 * 60, secret);
  }

  generateVerificationToken(userId: string, email: string): Promise<string> {
    return this.challengeService.issue('verify-2fa', userId, email, 5 * 60);
  }

  generateRecoveryToken(userId: string, email: string): Promise<string> {
    return this.challengeService.issue('recovery-2fa', userId, email, 30 * 60);
  }

  validateSetupTokenAndGetSecret(token: string) {
    return this.challengeService.validate(token, 'setup-2fa');
  }

  validateVerificationToken(token: string) {
    return this.challengeService.validate(token, 'verify-2fa');
  }

  validateRecoveryToken(token: string) {
    return this.challengeService.validate(token, 'recovery-2fa');
  }

  consumeChallenge(jti: string) {
    return this.challengeService.consume(jti);
  }

  async storeRecoveryCodes(userId: string, codes: string[]): Promise<void> {
    await this.prismaService.twoFactorRecoveryCode.deleteMany({
      where: { userId, isUsed: false },
    });

    const hashedCodes = await Promise.all(
      codes.map(async (code) => ({
        userId,
        code: await bcrypt.hash(code, 10),
      })),
    );

    await this.prismaService.twoFactorRecoveryCode.createMany({
      data: hashedCodes,
    });
  }

  async getTOTPSecret(userId: string): Promise<string | null> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (!user?.totpSecret) return null;
    return decryptSecret(user.totpSecret);
  }

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return user?.twoFactorEnabled || false;
  }

  async getTwoFactorStatus(userId: string): Promise<{
    enabled: boolean;
    required: boolean;
    backupCodesRemaining: number;
  }> {
    const [user, unusedBackupCodes] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true, twoFactorRequired: true },
      }),
      this.prismaService.twoFactorRecoveryCode.count({
        where: { userId, isUsed: false },
      }),
    ]);

    return {
      enabled: user?.twoFactorEnabled || false,
      required: user?.twoFactorRequired || false,
      backupCodesRemaining: unusedBackupCodes,
    };
  }

  async setTwoFactorRequired(userId: string, required: boolean): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { twoFactorRequired: required },
    });
  }

  async initiateUserEnable2FA(
    userId: string,
    email: string,
    password: string,
  ): Promise<{ secret: string; qrCode: string; setupToken: string }> {
    const isPasswordValid = await this.validatePassword(userId, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    const { secret, qrCode } = await this.generateTOTPSecret(email);
    const setupToken = await this.generateSetupTokenWithSecret(userId, email, secret);
    return { secret, qrCode, setupToken };
  }

  async confirmUserEnable2FA(
    userId: string,
    totpSecret: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const isCodeValid = await this.verifyTOTPCode(totpSecret, totpCode);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác. Vui lòng thử lại.');
    }

    const backupCodes = await this.generateBackupCodes(10);
    await this.enableTwoFactor(userId, totpSecret);
    await this.storeRecoveryCodes(userId, backupCodes);
    return { backupCodes };
  }

  async userDisable2FA(userId: string, password: string, totpCode: string): Promise<void> {
    const isPasswordValid = await this.validatePassword(userId, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    const isRequired = await this.isTwoFactorRequired(userId);
    if (isRequired) {
      throw new BadRequestException(
        'Tài khoản của bạn bắt buộc phải sử dụng 2FA. Liên hệ admin để gỡ yêu cầu này.',
      );
    }

    const totpSecret = await this.getTOTPSecret(userId);
    if (!totpSecret) {
      throw new BadRequestException('2FA chưa được bật cho tài khoản này');
    }

    const isCodeValid = await this.verifyTOTPCode(totpSecret, totpCode);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác');
    }

    await this.disableTwoFactor(userId, 'User disabled voluntarily');
  }

  async isTwoFactorRequired(userId: string): Promise<boolean> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { twoFactorRequired: true },
    });
    return user?.twoFactorRequired || false;
  }
}
