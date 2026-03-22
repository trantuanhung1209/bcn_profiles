import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Param,
  Inject,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { User } from './decorators/user.decorator';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailService } from './services/email.service';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { TwoFactorSetupGuard } from './guards/two-factor-setup.guard';
import { TwoFactorVerificationGuard } from './guards/two-factor-verification.guard';
import { TwoFactorRecoveryGuard } from './guards/two-factor-recovery.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { SetupTwoFactorDto } from './dto/setup-two-factor.dto';
import { VerifyTwoFactorTotpDto } from './dto/verify-two-factor-totp.dto';
import { VerifyTwoFactorEmailDto } from './dto/verify-two-factor-email.dto';
import { ConfirmTwoFactorSetupDto } from './dto/confirm-two-factor-setup.dto';
import { TwoFactorRecoveryRequestDto, VerifyRecoveryEmailDto, ResetTwoFactorAfterRecoveryDto } from './dto/two-factor-recovery.dto';
import { AdminResetTwoFactorDto } from './dto/admin-reset-two-factor.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private get baseCookieOptions(): CookieOptions {
    if (this.isProduction) {
      return {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: '.uside.studio',
        path: '/',
      };
    }

    // Localhost testing over HTTP cannot use SameSite=None + Secure.
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    };
  }

  private get accessTokenCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions,
      maxAge: 60 * 60 * 1000,
    };
  }

  private get refreshTokenCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  constructor(
    private readonly authService: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly twoFactorAuthService: TwoFactorAuthService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @User() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(user);

    // If 2FA setup is required - return setup token
    if (result.requiresTwoFactorSetup) {
      return {
        requiresTwoFactorSetup: true,
        setupToken: result.setupToken,
        message: result.message,
      };
    }

    // If 2FA verification is required - return verification token
    if (result.requiresTwoFactorVerification) {
      return {
        requiresTwoFactorVerification: true,
        verificationToken: result.verificationToken,
        message: result.message,
      };
    }

    // This shouldn't happen, but just in case
    throw new BadRequestException('Unexpected login flow');
  }

  @Get('profile')
  async getProfile(@User('id') ID: string) {
    return this.authService.getProfile(ID);
  }

  @Get('me')
  async getMe(@User() user: any) {
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // Lấy access token từ cookie để thêm vào blacklist
    const accessToken = response.req.cookies?.access_token;
    
    if (accessToken) {
      // Thêm token vào blacklist, tự động xóa sau 24h
      await this.tokenBlacklistService.addToBlacklist(accessToken, 24);
    }

    // Xóa cả 2 cookies với cùng options như lúc set
    response.clearCookie('access_token', this.baseCookieOptions);
    response.clearCookie('refresh_token', this.baseCookieOptions);

    return {
      message: 'Đăng xuất thành công',
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Res({ passthrough: true }) response: Response) {
    // Lấy refresh token từ cookie
    const refreshToken = response.req.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không tồn tại');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    // Set access token mới vào cookie
    response.cookie('access_token', result.access_token, this.accessTokenCookieOptions);

    // Set refresh token mới vào cookie
    response.cookie('refresh_token', result.refresh_token, this.refreshTokenCookieOptions);

    return {
      message: 'Làm mới token thành công',
      user: result.user,
    };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Throttle({ default: { ttl: 900000, limit: 3 } })
  @Post('change-email/request')
  @HttpCode(HttpStatus.OK)
  async requestEmailChange(
    @User() user: any,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.authService.requestEmailChange(user.id, dto);
  }

  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @Post('change-email/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmEmailChange(
    @User() user: any,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.authService.confirmEmailChange(user.id, dto);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard sẽ redirect đến Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @User() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.googleLogin(user);

    // Set access token vào cookie
    response.cookie('access_token', result.access_token, this.accessTokenCookieOptions);

    // Set refresh token vào cookie
    response.cookie('refresh_token', result.refresh_token, this.refreshTokenCookieOptions);

    return {
      message: 'Đăng nhập Google thành công',
      user: result.user,
    };
  }

  // ====== 2FA ENDPOINTS ======

  /**
   * SETUP FLOW: Initiate 2FA setup
   * POST /auth/2fa/setup/initiate
   * Requires setupToken (from login response)
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('2fa/setup/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateTwoFactorSetup(
    @User() user: any,
    @Body() dto: SetupTwoFactorDto,
  ) {
    // Validate password before allowing setup
    const isPasswordValid = await this.twoFactorAuthService.validatePassword(user.userId, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    // Generate TOTP secret and QR code
    const { secret, qrCode } = await this.twoFactorAuthService.generateTOTPSecret(user.email);

    // Generate new setupToken with secret embedded
    const setupTokenWithSecret = this.twoFactorAuthService.generateSetupTokenWithSecret(user.userId, user.email, secret);

    return {
      success: true,
      secret,
      qrCode,
      setupToken: setupTokenWithSecret,
      message: 'Quét mã QR bằng ứng dụng Authenticator (Google Authenticator, Authy, v.v.)',
    };
  }

  /**
   * SETUP FLOW: Verify TOTP code and get backup codes
   * POST /auth/2fa/setup/verify
   * Requires setupToken, TOTP secret, and valid TOTP code
   * Body: { secret: string, code: string }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('2fa/setup/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorSetup(
    @User() user: any,
    @Body() body: { secret: string; code: string },
  ) {
    if (!body.secret || !body.code) {
      throw new BadRequestException('Secret and code are required');
    }

    // Verify the TOTP code
    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(body.secret, body.code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác. Vui lòng thử lại.');
    }

    // Generate backup codes
    const backupCodes = await this.twoFactorAuthService.generateBackupCodes(10);

    // Return backup codes - user must confirm they saved them before completing setup
    return {
      success: true,
      backupCodes,
      message: 'Mã TOTP chính xác! Đây là mã backup của bạn. Lưu chúng ở nơi an toàn.',
      warningMessage: 'QUAN TRỌNG: Lưu những mã này ở nơi an toàn. Nếu mất access 2FA, bạn sẽ cần những mã này để khôi phục.',
      nextStep: 'Gọi endpoint confirm-2fa-setup để hoàn tất setup',
    };
  }

  /**
   * SETUP FLOW: Confirm 2FA setup with backup codes
   * POST /auth/2fa/setup/confirm
   * Requires setupToken, secret, and backup codes
   * Body: { secret: string, backupCodes: string[] }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('2fa/setup/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorSetup(
    @User() user: any,
    @Body() body: { secret: string; backupCodes: string[] },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.secret || !body.backupCodes || body.backupCodes.length === 0) {
      throw new BadRequestException('Secret and backup codes are required');
    }

    // Get the expected secret from setupToken via user context
    // The TwoFactorSetupGuard already validates the token, so we have the user info
    // But we need to validate that the secret provided matches what was set up
    // For now, we'll trust the setupToken already validated the user
    // Additional validation: secret format should be base32
    if (!/^[A-Z2-7]+={0,6}$/.test(body.secret)) {
      throw new BadRequestException('Invalid secret format');
    }

    // Validate that the secret matches the one from setupToken
    if (!user.totpSecret) {
      throw new UnauthorizedException('Setup token does not contain secret. Please restart setup.');
    }

    if (body.secret !== user.totpSecret) {
      throw new UnauthorizedException('Secret does not match. Please use the secret from setup/initiate.');
    }

    // Save TOTP secret and backup codes to database
    await this.twoFactorAuthService.enableTwoFactor(user.userId, body.secret, body.backupCodes);
    
    // Store recovery codes in separate table for one-time use tracking
    await this.twoFactorAuthService.storeRecoveryCodes(user.userId, body.backupCodes);

    // Generate actual access tokens after successful 2FA setup
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);

    // Set cookies
    response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);

    response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

    return {
      success: true,
      message: '2FA setup hoàn tất! Tài khoản của bạn hiện đã được bảo vệ bằng 2FA.',
      user: tokens.user,
      securityTip: 'Giữ mã backup ở nơi an toàn. Nếu mất access 2FA, bạn sẽ cần những mã này.',
    };
  }

  /**
   * VERIFICATION FLOW: Verify TOTP code after login
   * POST /auth/2fa/verify/totp
   * Requires verificationToken (header) and TOTP code (body)
   * Header: Authorization: Bearer <verificationToken>
   * Body: { code: string }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/verify/totp')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorTOTP(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Code is required');
    }

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const verificationToken = authHeader.split(' ')[1];
    if (!verificationToken) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const user = this.twoFactorAuthService.validateVerificationToken(verificationToken);
    
    // Get user's TOTP secret from database
    const totpSecret = await this.twoFactorAuthService.getTOTPSecret(user.userId);
    if (!totpSecret) {
      throw new UnauthorizedException('2FA chưa được thiết lập');
    }

    // Verify the TOTP code
    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(totpSecret, code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác');
    }

    // Generate real access tokens
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);

    // Set cookies
    response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);

    response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

    return {
      success: true,
      message: 'Đăng nhập thành công',
      user: tokens.user,
    };
  }

  /**
   * VERIFICATION FLOW: Verify email OTP as 2FA backup
   * POST /auth/2fa/verify/email
   * Requires verificationToken (header) and email OTP code (body)
   * Header: Authorization: Bearer <verificationToken>
   * Body: { code: string }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/verify/email')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorEmail(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Code is required');
    }

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const verificationToken = authHeader.split(' ')[1];
    if (!verificationToken) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const user = this.twoFactorAuthService.validateVerificationToken(verificationToken);
    const isEmailOTPValid = await this.twoFactorAuthService.verifyEmailOTP(user.email, code);

    if (!isEmailOTPValid) {
      throw new UnauthorizedException('Mã OTP email không chính xác hoặc đã hết hạn');
    }

    // Generate real access tokens
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);

    // Set cookies
    response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);

    response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

    return {
      success: true,
      message: 'Đăng nhập thành công',
      user: tokens.user,
    };
  }

  /**
   * VERIFICATION FLOW: Verify backup code as 2FA alternative
   * POST /auth/2fa/verify/backup-code
   * Requires verificationToken (header) and backup code (body)
   * Header: Authorization: Bearer <verificationToken>
   * Body: { code: string }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/verify/backup-code')
  @HttpCode(HttpStatus.OK)
  async verifyBackupCode(
    @Body('code') code: string,
    @Headers('authorization') authHeader: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Code is required');
    }

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const verificationToken = authHeader.split(' ')[1];
    if (!verificationToken) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const user = this.twoFactorAuthService.validateVerificationToken(verificationToken);
    const isBackupCodeValid = await this.twoFactorAuthService.markBackupCodeAsUsed(user.userId, code);

    if (!isBackupCodeValid) {
      throw new UnauthorizedException('Mã backup không chính xác hoặc đã được sử dụng');
    }

    // Generate real access tokens
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);

    // Set cookies
    response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);

    response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

    return {
      success: true,
      message: 'Đăng nhập thành công (sử dụng mã backup)',
      user: tokens.user,
      warningMessage: 'Bạn chỉ còn lại một số ít mã backup. Hãy yêu cầu thêm mã.',
    };
  }

  /**
   * REQUEST EMAIL OTP FOR VERIFICATION
   * POST /auth/2fa/send-email-otp
   * Requires verificationToken in header
   * Header: Authorization: Bearer <verificationToken>
   */
  @Public()
  @Throttle({ default: { ttl: 300000, limit: 3 } }) // 5 min, 3 requests
  @Post('2fa/send-email-otp')
  @HttpCode(HttpStatus.OK)
  async sendTwoFactorEmailOTP(
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const verificationToken = authHeader.split(' ')[1];
    if (!verificationToken) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const user = this.twoFactorAuthService.validateVerificationToken(verificationToken);
    await this.twoFactorAuthService.generateAndSendEmailOTP(user.email);

    return {
      success: true,
      message: 'Mã OTP đã được gửi đến email của bạn',
    };
  }

  /**
   * RECOVERY FLOW: Request 2FA recovery
   * POST /auth/2fa/recovery/request
   * Public endpoint - user provides email
   */
  @Public()
  @Throttle({ default: { ttl: 900000, limit: 2 } }) // 15 min, 2 requests
  @Post('2fa/recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestTwoFactorRecovery(
    @Body() dto: TwoFactorRecoveryRequestDto,
  ) {
    // Generate 6-digit recovery OTP
    const recoveryOtp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Send recovery email
    await this.twoFactorAuthService.generateAndSendEmailOTP(dto.email);

    // Store recovery request in a way that we can verify
    // For now, the generateAndSendEmailOTP stores it

    return {
      success: true,
      message: 'Nếu email tồn tại, bạn sẽ nhận được mã khôi phục. Vui lòng kiểm tra hộp thư.',
      nextStep: 'Sử dụng mã để xác nhận yêu cầu khôi phục',
    };
  }

  /**
   * RECOVERY FLOW: Verify recovery email OTP
   * POST /auth/2fa/recovery/verify-email
   * Public endpoint - user provides email and recovery OTP
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/recovery/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyRecoveryEmail(
    @Body() dto: VerifyRecoveryEmailDto,
  ) {
    const isValid = await this.twoFactorAuthService.verifyEmailOTP(dto.email, dto.recoveryOtp);
    
    if (!isValid) {
      throw new UnauthorizedException('Mã khôi phục không chính xác hoặc đã hết hạn');
    }

    // Get user ID from email via Prisma
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    // Generate recovery token for resetting 2FA
    const recoveryToken = this.twoFactorAuthService.generateRecoveryToken(user.id, dto.email);

    return {
      success: true,
      recoveryToken,
      message: 'Xác minh email thành công. Bây giờ bạn có thể reset 2FA.',
      nextStep: 'Gọi endpoint reset 2FA recovery với recovery token này',
    };
  }

  /**
   * RECOVERY FLOW: Reset 2FA after recovery email verification
   * POST /auth/2fa/recovery/reset
   * Requires recoveryToken (from previous step)
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(TwoFactorRecoveryGuard)
  @Post('2fa/recovery/reset')
  @HttpCode(HttpStatus.OK)
  async resetTwoFactorAfterRecovery(
    @User() user: any,
  ) {
    // Disable 2FA for user
    await this.twoFactorAuthService.disableTwoFactor(user.userId, 'User requested recovery');

    return {
      success: true,
      message: '2FA đã được reset. Vui lòng đăng nhập lại để thiết lập 2FA mới.',
      nextStep: 'Đăng nhập lại để hoàn tất quá trình thiết lập 2FA',
    };
  }

  /**
   * ADMIN ENDPOINTS: Get 2FA status
   * GET /auth/2fa/status/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Get('2fa/status/:userId')
  async getTwoFactorStatus(
    @Param('userId') userId: string,
  ) {
    const status = await this.twoFactorAuthService.getTwoFactorStatus(userId);
    return status;
  }

  /**
   * ADMIN ENDPOINTS: Reset user's 2FA
   * POST /auth/2fa/admin/reset/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/admin/reset/:userId')
  @HttpCode(HttpStatus.OK)
  async adminResetTwoFactor(
    @Param('userId') userId: string,
    @Body() dto: AdminResetTwoFactorDto,
    @User() adminUser: any,
  ) {
    // Log admin action for audit
    console.log(`Admin ${adminUser.email} is resetting 2FA for user ${userId}. Reason: ${dto.reason || 'Not provided'}`);

    // Disable 2FA for user
    await this.twoFactorAuthService.disableTwoFactor(userId, `Admin reset by ${adminUser.email}: ${dto.reason || 'No reason provided'}`);

    // Send notification email to user
    const userData = await this.authService.getProfile(userId);
    if (userData) {
      await this.emailService.sendAdminResetNotification(userData.email, userData.fullName || undefined);
    }

    return {
      success: true,
      message: `2FA của user ${userId} đã được reset. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  /**
   * ADMIN ENDPOINTS: Disable 2FA for user
   * POST /auth/2fa/admin/disable/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('2fa/admin/disable/:userId')
  @HttpCode(HttpStatus.OK)
  async adminDisableTwoFactor(
    @Param('userId') userId: string,
    @User() adminUser: any,
  ) {
    // Disable 2FA for user
    await this.twoFactorAuthService.disableTwoFactor(userId, `Disabled by admin ${adminUser.email}`);

    return {
      success: true,
      message: `2FA của user ${userId} đã được vô hiệu hóa.`,
    };
  }
}
