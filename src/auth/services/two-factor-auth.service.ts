import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';

@Injectable()
export class TwoFactorAuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate TOTP secret and QR code for initial setup
   */
  async generateTOTPSecret(email: string): Promise<{ secret: string; qrCode: string }> {
    const secret = speakeasy.generateSecret({
      name: `BCN Profiles (${email})`,
      issuer: 'BCN Profiles',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = secret.otpauth_url || '';
    const qrCode = await QRCode.toDataURL(qrCodeUrl);

    return {
      secret: secret.base32 || '',
      qrCode: qrCode || '',
    };
  }

  /**
   * Verify TOTP code against secret
   */
  async verifyTOTPCode(secret: string, code: string): Promise<boolean> {
    // Accept codes from -1 to +1 time windows for clock skew tolerance
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    return isValid;
  }

  /**
   * Generate backup recovery codes (10 codes)
   */
  async generateBackupCodes(count: number = 10): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  async hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
  }

  /**
   * Verify backup code against hashed codes
   */
  async verifyBackupCode(plainCode: string, hashedCode: string): Promise<boolean> {
    return await bcrypt.compare(plainCode, hashedCode);
  }

  /**
   * Save TOTP secret and backup codes for user
   */
  async enableTwoFactor(
    userId: string,
    totpSecret: string,
    backupCodes: string[],
  ): Promise<void> {
    const hashedBackupCodes = await this.hashBackupCodes(backupCodes);

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        totpSecret,
        metadata: {
          backupCodes: hashedBackupCodes,
          backupCodesCreatedAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Disable 2FA for user (admin or recovery)
   */
  async disableTwoFactor(userId: string, reason?: string): Promise<void> {
    const metadata = {
      disabledAt: new Date().toISOString(),
      disabledReason: reason || 'User requested reset',
    };

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        totpSecret: null,
        metadata,
      },
    });
  }

  /**
   * Get unused backup codes for a user
   */
  async getUnusedBackupCodes(userId: string): Promise<string[]> {
    const codes = await this.prismaService.twoFactorRecoveryCode.findMany({
      where: { userId, isUsed: false },
      select: { code: true },
    });
    return codes.map((c: { code: string }) => c.code);
  }

  /**
   * Mark backup code as used
   */
  async markBackupCodeAsUsed(userId: string, plainCode: string): Promise<boolean> {
    // Get all unused backup codes
    const unusedCodes = await this.prismaService.twoFactorRecoveryCode.findMany({
      where: { userId, isUsed: false },
      select: { id: true, code: true },
    });

    // Find and mark matching code as used
    for (const codeRecord of unusedCodes) {
      const isMatch = await this.verifyBackupCode(plainCode, codeRecord.code);
      if (isMatch) {
        await this.prismaService.twoFactorRecoveryCode.update({
          where: { id: codeRecord.id },
          data: { isUsed: true, usedAt: new Date() },
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Generate and send email OTP for 2FA verification
   */
  async generateAndSendEmailOTP(email: string): Promise<string> {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in PasswordReset table (can be reused for OTP)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prismaService.passwordReset.create({
      data: {
        id: `2fa-email-${Date.now()}-${Math.random()}`,
        email,
        otp,
        expiresAt,
        isUsed: false,
      },
    });

    // Dispatch email sending in background so API does not wait for SMTP round-trip.
    void this.emailService.sendTwoFactorOTP(email, otp).catch((error) => {
      console.error('Failed to send 2FA OTP email in background:', error);
    });

    return otp; // Return for testing purposes, in production should not return
  }

  /**
   * Verify email OTP
   */
  async verifyEmailOTP(email: string, otp: string): Promise<boolean> {
    const record = await this.prismaService.passwordReset.findFirst({
      where: {
        email,
        otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      return false;
    }

    // Mark as used
    await this.prismaService.passwordReset.update({
      where: { id: record.id },
      data: { isUsed: true },
    });

    return true;
  }

  /**
   * Validate password before allowing 2FA setup
   */
  async validatePassword(userId: string, password: string): Promise<boolean> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user || !user.password) {
      return false;
    }

    return await bcrypt.compare(password, user.password);
  }

  /**
   * Generate setup token that allows access to setup endpoints
   */
  generateSetupToken(userId: string, email: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    return this.jwtService.sign(
      {
        sub: userId,
        email,
        type: 'setup-2fa',
      },
      {
        secret,
        expiresIn: '15m',
      },
    );
  }

  /**
   * Generate setup token with TOTP secret
   */
  generateSetupTokenWithSecret(userId: string, email: string, secret: string): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    return this.jwtService.sign(
      {
        sub: userId,
        email,
        type: 'setup-2fa',
        totpSecret: secret,
      },
      {
        secret: jwtSecret,
        expiresIn: '15m',
      },
    );
  }

  /**
   * Generate verification token for 2FA verification flow
   */
  generateVerificationToken(userId: string, email: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    return this.jwtService.sign(
      {
        sub: userId,
        email,
        type: 'verify-2fa',
      },
      {
        secret,
        expiresIn: '5m', // Verification token expires in 5 minutes
      },
    );
  }

  /**
   * Generate recovery token for recovery email flow
   */
  generateRecoveryToken(userId: string, email: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    return this.jwtService.sign(
      {
        sub: userId,
        email,
        type: 'recovery-2fa',
      },
      {
        secret,
        expiresIn: '30m', // Recovery token expires in 30 minutes
      },
    );
  }

  /**
   * Validate setup token and get TOTP secret
   */
  validateSetupTokenAndGetSecret(token: string): { userId: string; email: string; totpSecret: string } {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    try {
      const payload = this.jwtService.verify(token, {
        secret,
      });

      if (payload.type !== 'setup-2fa') {
        throw new UnauthorizedException('Invalid token type');
      }

      return {
        userId: payload.sub,
        email: payload.email,
        totpSecret: payload.totpSecret,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired setup token');
    }
  }

  /**
   * Validate verification token
   */
  validateVerificationToken(token: string): { userId: string; email: string } {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    try {
      const payload = this.jwtService.verify(token, {
        secret,
      });

      if (payload.type !== 'verify-2fa') {
        throw new UnauthorizedException('Invalid token type');
      }

      return {
        userId: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
  }

  /**
   * Validate recovery token
   */
  validateRecoveryToken(token: string): { userId: string; email: string } {
    const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
    try {
      const payload = this.jwtService.verify(token, {
        secret,
      });

      if (payload.type !== 'recovery-2fa') {
        throw new UnauthorizedException('Invalid token type');
      }

      return {
        userId: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired recovery token');
    }
  }

  /**
   * Store recovery codes in database for one-time use tracking
   */
  async storeRecoveryCodes(userId: string, codes: string[]): Promise<void> {
    // Delete old unused recovery codes
    await this.prismaService.twoFactorRecoveryCode.deleteMany({
      where: {
        userId,
        isUsed: false,
      },
    });

    // Hash and store new codes
    const hashedCodes = await Promise.all(
      codes.map(async (code) => {
        const hashed = await bcrypt.hash(code, 10);
        return {
          userId,
          code: hashed,
        };
      }),
    );

    await this.prismaService.twoFactorRecoveryCode.createMany({
      data: hashedCodes,
    });
  }

  /**
   * Get TOTP secret for a user (for verification)
   */
  async getTOTPSecret(userId: string): Promise<string | null> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });

    return user?.totpSecret || null;
  }

  /**
   * Check if user has 2FA enabled
   */
  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    return user?.twoFactorEnabled || false;
  }

  /**
   * Get user 2FA status
   */
  async getTwoFactorStatus(userId: string): Promise<{
    enabled: boolean;
    backupCodesRemaining: number;
  }> {
    const [user, unusedBackupCodes] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      }),
      this.prismaService.twoFactorRecoveryCode.count({
        where: {
          userId,
          isUsed: false,
        },
      }),
    ]);

    return {
      enabled: user?.twoFactorEnabled || false,
      backupCodesRemaining: unusedBackupCodes,
    };
  }
}
