import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { AuthCookiesService } from '../services/auth-cookies.service';
import { TwoFactorAuthService } from '../services/two-factor-auth.service';
import { EmailService } from '../services/email.service';
import { Public } from '../decorators/public.decorator';
import { User } from '../decorators/user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { TwoFactorSetupGuard } from '../guards/two-factor-setup.guard';
import { TwoFactorRecoveryGuard } from '../guards/two-factor-recovery.guard';
import { SetupTwoFactorDto } from '../dto/setup-two-factor.dto';
import {
  ResetTwoFactorAfterRecoveryDto,
  TwoFactorRecoveryRequestDto,
  VerifyRecoveryEmailDto,
} from '../dto/two-factor-recovery.dto';
import {
  ConfirmEnable2FADto,
  Disable2FADto,
  InitiateEnable2FADto,
} from '../dto/enable-two-factor.dto';
import { AdminResetTwoFactorDto } from '../dto/admin-reset-two-factor.dto';
import { extractBearerToken } from '../utils/bearer-token';

@Controller('auth/2fa')
export class TwoFactorController {
  private readonly logger = new Logger(TwoFactorController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly authCookies: AuthCookiesService,
    private readonly twoFactorAuthService: TwoFactorAuthService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Forced setup (after login when twoFactorRequired) ──────────────

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('setup/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateTwoFactorSetup(@User() user: any, @Body() dto: SetupTwoFactorDto) {
    const isPasswordValid = await this.twoFactorAuthService.validatePassword(
      user.userId,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    await this.twoFactorAuthService.consumeChallenge(user.jti);

    const { secret, qrCode } = await this.twoFactorAuthService.generateTOTPSecret(user.email);
    const setupToken = await this.twoFactorAuthService.generateSetupTokenWithSecret(
      user.userId,
      user.email,
      secret,
    );

    return {
      success: true,
      secret,
      qrCode,
      setupToken,
      message: 'Quét mã QR bằng ứng dụng Authenticator (Google Authenticator, Authy, v.v.)',
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('setup/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorSetup(
    @User() user: any,
    @Body() body: { secret?: string; code: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.code) {
      throw new BadRequestException('TOTP code is required');
    }

    const totpSecret = user.totpSecret as string | undefined;
    if (!totpSecret) {
      throw new UnauthorizedException(
        'Setup token does not contain secret. Please restart setup.',
      );
    }
    if (body.secret && body.secret !== totpSecret) {
      throw new UnauthorizedException(
        'Secret does not match. Please use the secret from setup/initiate.',
      );
    }

    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(totpSecret, body.code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác. Vui lòng thử lại.');
    }

    await this.consumeOrThrow(user.jti, 'Setup token đã được sử dụng');

    const backupCodes = await this.twoFactorAuthService.generateBackupCodes(10);
    await this.twoFactorAuthService.enableTwoFactor(user.userId, totpSecret);
    await this.twoFactorAuthService.storeRecoveryCodes(user.userId, backupCodes);

    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);
    this.authCookies.setAuthCookies(response, tokens);

    return {
      success: true,
      message: '2FA setup hoàn tất! Tài khoản của bạn hiện đã được bảo vệ bằng 2FA.',
      backupCodes,
      user: tokens.user,
      securityTip: 'Giữ mã backup ở nơi an toàn. Nếu mất access 2FA, bạn sẽ cần những mã này.',
    };
  }

  // ── Login verification ─────────────────────────────────────────────

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('verify/totp')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorTOTP(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) throw new BadRequestException('Code is required');

    const verificationToken = extractBearerToken(authHeader);
    const challenge =
      await this.twoFactorAuthService.validateVerificationToken(verificationToken);

    const totpSecret = await this.twoFactorAuthService.getTOTPSecret(challenge.userId);
    if (!totpSecret) {
      throw new UnauthorizedException('2FA chưa được thiết lập');
    }

    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(totpSecret, code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác');
    }

    return this.finishVerificationLogin(challenge.jti, challenge.userId, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('verify/email')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorEmail(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) throw new BadRequestException('Code is required');

    const verificationToken = extractBearerToken(authHeader);
    const challenge =
      await this.twoFactorAuthService.validateVerificationToken(verificationToken);

    const isEmailOTPValid = await this.twoFactorAuthService.verifyEmailOTP(
      challenge.email,
      code,
    );
    if (!isEmailOTPValid) {
      throw new UnauthorizedException('Mã OTP email không chính xác hoặc đã hết hạn');
    }

    return this.finishVerificationLogin(challenge.jti, challenge.userId, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('verify/backup-code')
  @HttpCode(HttpStatus.OK)
  async verifyBackupCode(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) throw new BadRequestException('Code is required');

    const verificationToken = extractBearerToken(authHeader);
    const challenge =
      await this.twoFactorAuthService.validateVerificationToken(verificationToken);

    const isBackupCodeValid = await this.twoFactorAuthService.markBackupCodeAsUsed(
      challenge.userId,
      code,
    );
    if (!isBackupCodeValid) {
      throw new UnauthorizedException('Mã backup không chính xác hoặc đã được sử dụng');
    }

    const result = await this.finishVerificationLogin(
      challenge.jti,
      challenge.userId,
      response,
    );
    return {
      ...result,
      message: 'Đăng nhập thành công (sử dụng mã backup)',
      warningMessage: 'Bạn chỉ còn lại một số ít mã backup. Hãy yêu cầu thêm mã.',
    };
  }

  @Public()
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @Post('send-email-otp')
  @HttpCode(HttpStatus.OK)
  async sendTwoFactorEmailOTP(@Headers('authorization') authHeader: string) {
    const verificationToken = extractBearerToken(authHeader);
    const challenge =
      await this.twoFactorAuthService.validateVerificationToken(verificationToken);
    await this.twoFactorAuthService.generateAndSendEmailOTP(challenge.email);
    return {
      success: true,
      message: 'Mã OTP đã được gửi đến email của bạn',
    };
  }

  // ── Recovery ───────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  @Post('recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestTwoFactorRecovery(@Body() dto: TwoFactorRecoveryRequestDto) {
    const generic = {
      success: true,
      message: 'Nếu email tồn tại và đã bật 2FA, bạn sẽ nhận được mã khôi phục.',
      nextStep: 'Sử dụng mã để xác nhận yêu cầu khôi phục',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, twoFactorEnabled: true, status: true },
    });

    if (user?.twoFactorEnabled && user.status === 'ACTIVE') {
      await this.twoFactorAuthService.generateAndSendEmailOTP(dto.email);
    }

    return generic;
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('recovery/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyRecoveryEmail(@Body() dto: VerifyRecoveryEmailDto) {
    const isValid = await this.twoFactorAuthService.verifyEmailOTP(
      dto.email,
      dto.recoveryOtp,
    );
    if (!isValid) {
      throw new UnauthorizedException('Mã khôi phục không chính xác hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, twoFactorEnabled: true, status: true },
    });
    if (!user?.twoFactorEnabled || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Không thể khôi phục 2FA cho tài khoản này');
    }

    const recoveryToken = await this.twoFactorAuthService.generateRecoveryToken(
      user.id,
      dto.email,
    );

    return {
      success: true,
      recoveryToken,
      message: 'Xác minh email thành công. Nhập mật khẩu tài khoản để reset 2FA.',
      nextStep: 'Gọi endpoint reset 2FA recovery với recovery token + password',
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(TwoFactorRecoveryGuard)
  @Post('recovery/reset')
  @HttpCode(HttpStatus.OK)
  async resetTwoFactorAfterRecovery(
    @User() user: any,
    @Body() dto: ResetTwoFactorAfterRecoveryDto,
  ) {
    const passwordOk = await this.twoFactorAuthService.validatePassword(
      user.userId,
      dto.password,
    );
    if (!passwordOk) {
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    await this.consumeOrThrow(user.jti, 'Recovery token đã được sử dụng');
    await this.twoFactorAuthService.disableTwoFactor(user.userId, 'User requested recovery');

    return {
      success: true,
      message: '2FA đã được reset. Vui lòng đăng nhập lại để thiết lập 2FA mới.',
      nextStep: 'Đăng nhập lại để hoàn tất quá trình thiết lập 2FA',
    };
  }

  // ── Self-service ───────────────────────────────────────────────────

  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('me/enable/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateMyEnable2FA(@User() user: any, @Body() dto: InitiateEnable2FADto) {
    const result = await this.twoFactorAuthService.initiateUserEnable2FA(
      user.id,
      user.email,
      dto.password,
    );

    return {
      success: true,
      secret: result.secret,
      qrCode: result.qrCode,
      setupToken: result.setupToken,
      message: 'Quét mã QR bằng ứng dụng Authenticator rồi gọi confirm để hoàn tất.',
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('me/enable/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmMyEnable2FA(@User() user: any, @Body() dto: ConfirmEnable2FADto) {
    const totpSecret = user.totpSecret as string | undefined;
    if (!totpSecret) {
      throw new BadRequestException(
        'Setup token không chứa secret. Vui lòng bắt đầu lại từ bước initiate.',
      );
    }
    if (dto.secret && dto.secret !== totpSecret) {
      throw new BadRequestException('Secret không khớp với setup token.');
    }

    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(totpSecret, dto.code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác. Vui lòng thử lại.');
    }

    await this.consumeOrThrow(user.jti, 'Setup token đã được sử dụng');

    const { backupCodes } = await this.twoFactorAuthService.confirmUserEnable2FA(
      user.userId,
      totpSecret,
      dto.code,
    );

    return {
      success: true,
      backupCodes,
      message: '2FA đã được bật thành công! Lưu các mã backup ở nơi an toàn.',
      warning: 'Nếu mất thiết bị Authenticator, bạn sẽ cần các mã backup này để đăng nhập.',
    };
  }

  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('me/disable')
  @HttpCode(HttpStatus.OK)
  async disableMy2FA(@User() user: any, @Body() dto: Disable2FADto) {
    await this.twoFactorAuthService.userDisable2FA(user.id, dto.password, dto.totpCode);
    return {
      success: true,
      message:
        '2FA đã được tắt. Tài khoản của bạn sẽ đăng nhập trực tiếp bằng email và mật khẩu.',
    };
  }

  @SkipThrottle()
  @Get('me/status')
  async getMy2FAStatus(@User() user: any) {
    const status = await this.twoFactorAuthService.getTwoFactorStatus(user.id);
    return {
      twoFactorEnabled: status.enabled,
      twoFactorRequired: status.required,
      backupCodesRemaining: status.backupCodesRemaining,
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('admin/reset/:userId')
  @HttpCode(HttpStatus.OK)
  async adminResetTwoFactor(
    @Param('userId') userId: string,
    @Body() dto: AdminResetTwoFactorDto,
    @User() adminUser: any,
  ) {
    this.logger.log(
      `Admin ${adminUser.email} is resetting 2FA for user ${userId}. Reason: ${dto.reason || 'Not provided'}`,
    );

    const userData = await this.requireUser(userId, {
      id: true,
      email: true,
      fullName: true,
    });

    await this.twoFactorAuthService.disableTwoFactor(
      userId,
      `Admin reset by ${adminUser.email}: ${dto.reason || 'No reason provided'}`,
    );

    void this.emailService
      .sendAdminResetNotification(userData.email, userData.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send admin reset notification in background',
          error instanceof Error ? error.stack : undefined,
        );
      });

    return {
      success: true,
      message: `2FA của user ${userId} đã được reset. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('admin/require/:userId')
  @HttpCode(HttpStatus.OK)
  async adminEnforceTwoFactorRequired(
    @Param('userId') userId: string,
    @User() adminUser: any,
  ) {
    const user = await this.requireUser(userId, {
      id: true,
      email: true,
      fullName: true,
    });

    await this.twoFactorAuthService.setTwoFactorRequired(userId, true);
    this.logger.log(`Admin ${adminUser.email} enforced 2FA requirement for user ${userId}`);

    void this.emailService
      .sendTwoFactorEnforcedNotification(user.email, user.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send 2FA enforcement notification',
          error instanceof Error ? error.stack : undefined,
        );
      });

    return {
      success: true,
      message: `User ${userId} bắt buộc phải sử dụng 2FA. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('admin/unrequire/:userId')
  @HttpCode(HttpStatus.OK)
  async adminRemoveTwoFactorRequired(
    @Param('userId') userId: string,
    @User() adminUser: any,
  ) {
    const user = await this.requireUser(userId, {
      id: true,
      email: true,
      fullName: true,
    });

    await this.twoFactorAuthService.setTwoFactorRequired(userId, false);
    this.logger.log(`Admin ${adminUser.email} made 2FA optional for user ${userId}`);

    void this.emailService
      .sendTwoFactorOptionalNotification(user.email, user.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send 2FA optional notification',
          error instanceof Error ? error.stack : undefined,
        );
      });

    return {
      success: true,
      message: `User ${userId} không bắt buộc phải sử dụng 2FA nữa. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @Get('admin/status/:userId')
  @HttpCode(HttpStatus.OK)
  async adminGetTwoFactorStatus(@Param('userId') userId: string) {
    const user = await this.requireUser(userId, {
      id: true,
      email: true,
      twoFactorEnabled: true,
      twoFactorRequired: true,
    });
    const status = await this.twoFactorAuthService.getTwoFactorStatus(userId);

    return {
      userId: user.id,
      email: user.email,
      twoFactorEnabled: status.enabled,
      twoFactorRequired: status.required,
      backupCodesRemaining: status.backupCodesRemaining,
      status: {
        setup: status.enabled ? '✅ Đã setup' : '❌ Chưa setup',
        requirement: status.required ? '🔒 Bắt buộc' : '✔️ Tuỳ chọn',
      },
    };
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async finishVerificationLogin(
    jti: string,
    userId: string,
    response: Response,
  ) {
    await this.consumeOrThrow(jti, 'Verification token đã được sử dụng');
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(userId);
    this.authCookies.setAuthCookies(response, tokens);
    return {
      success: true,
      message: 'Đăng nhập thành công',
      user: tokens.user,
    };
  }

  private async consumeOrThrow(jti: string, message: string): Promise<void> {
    const consumed = await this.twoFactorAuthService.consumeChallenge(jti);
    if (!consumed) {
      throw new UnauthorizedException(message);
    }
  }

  private async requireUser(
    userId: string,
    select: {
      id?: boolean;
      email?: boolean;
      fullName?: boolean;
      twoFactorEnabled?: boolean;
      twoFactorRequired?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select,
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} không tồn tại`);
    }
    return user;
  }
}
