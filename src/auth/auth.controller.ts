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
  BadRequestException,
  Headers,
  Logger,
  NotFoundException,
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
import { TwoFactorRecoveryGuard } from './guards/two-factor-recovery.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { SetupTwoFactorDto } from './dto/setup-two-factor.dto';
import { TwoFactorRecoveryRequestDto, VerifyRecoveryEmailDto } from './dto/two-factor-recovery.dto';
import { AdminResetTwoFactorDto } from './dto/admin-reset-two-factor.dto';
import { PrismaService } from '../prisma/prisma.service';
import { InitiateEnable2FADto, ConfirmEnable2FADto, Disable2FADto } from './dto/enable-two-factor.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

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

    // Development: sameSite='none' + secure=false cho phép cross-origin giữa
    // các port localhost (e.g. FE :5173 <-> BE :3000).
    // Lưu ý: Chrome/Firefox chấp nhận sameSite=none mà không có secure ở localhost.
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'none',
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
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 50 } })
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

    // If 2FA can be skipped - generate tokens and login directly
    if (result.skipTwoFactor) {
      const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.id);

      response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);
      response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

      return {
        message: 'Đăng nhập thành công (2FA không bắt buộc)',
        user: tokens.user,
        skipTwoFactor: true,
      };
    }

    // This shouldn't happen, but just in case
    throw new BadRequestException('Unexpected login flow');
  }

  @Get('profile')
  async getProfile(@User() user: any) {
    // User already resolved by JwtStrategy (JWT claims / cache) — avoid an extra DB round-trip.
    return user;
  }

  @Get('me')
  @SkipThrottle()
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
  @Throttle({ default: { ttl: 60000, limit: 100 } })
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
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Throttle({ default: { ttl: 900000, limit: 30 } })
  @Post('change-email/request')
  @HttpCode(HttpStatus.OK)
  async requestEmailChange(
    @User() user: any,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.authService.requestEmailChange(user.id, dto);
  }

  @Throttle({ default: { ttl: 900000, limit: 50 } })
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
  @Throttle({ default: { ttl: 60000, limit: 30 } })
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
   * --- REMOVED: logic merged into setup/confirm ---
   */

  /**
   * SETUP FLOW: Confirm 2FA setup — verify TOTP, generate + save backup codes, issue tokens
   * POST /auth/2fa/setup/confirm
   * Requires setupToken (header), body: { secret: string, code: string }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('2fa/setup/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorSetup(
    @User() user: any,
    @Body() body: { secret: string; code: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.secret || !body.code) {
      throw new BadRequestException('Secret and TOTP code are required');
    }

    if (!/^[A-Z2-7]+=*$/.test(body.secret)) {
      throw new BadRequestException('Invalid secret format');
    }

    if (!user.totpSecret) {
      throw new UnauthorizedException('Setup token does not contain secret. Please restart setup.');
    }

    if (body.secret !== user.totpSecret) {
      throw new UnauthorizedException('Secret does not match. Please use the secret from setup/initiate.');
    }

    // Verify TOTP code before saving anything
    const isCodeValid = await this.twoFactorAuthService.verifyTOTPCode(body.secret, body.code);
    if (!isCodeValid) {
      throw new UnauthorizedException('Mã TOTP không chính xác. Vui lòng thử lại.');
    }

    // Generate backup codes server-side (not client-provided)
    const backupCodes = await this.twoFactorAuthService.generateBackupCodes(10);

    // Save TOTP secret to database and enable 2FA
    await this.twoFactorAuthService.enableTwoFactor(user.userId, body.secret);

    // Store recovery codes in separate table for one-time use tracking
    await this.twoFactorAuthService.storeRecoveryCodes(user.userId, backupCodes);

    // Generate actual access tokens after successful 2FA setup
    const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.userId);

    // Set cookies
    response.cookie('access_token', tokens.access_token, this.accessTokenCookieOptions);
    response.cookie('refresh_token', tokens.refresh_token, this.refreshTokenCookieOptions);

    return {
      success: true,
      message: '2FA setup hoàn tất! Tài khoản của bạn hiện đã được bảo vệ bằng 2FA.',
      backupCodes,
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
  @Throttle({ default: { ttl: 60000, limit: 50 } })
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
  @Throttle({ default: { ttl: 60000, limit: 50 } })
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
  @Throttle({ default: { ttl: 60000, limit: 50 } })
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
  @Throttle({ default: { ttl: 300000, limit: 30 } }) // 5 min, 3 requests
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
  @Throttle({ default: { ttl: 900000, limit: 20 } }) // 15 min, 2 requests
  @Post('2fa/recovery/request')
  @HttpCode(HttpStatus.OK)
  async requestTwoFactorRecovery(
    @Body() dto: TwoFactorRecoveryRequestDto,
  ) {
    // Send recovery OTP to email (OTP is generated inside generateAndSendEmailOTP)
    await this.twoFactorAuthService.generateAndSendEmailOTP(dto.email);

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
  @Throttle({ default: { ttl: 60000, limit: 50 } })
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
  @Throttle({ default: { ttl: 60000, limit: 30 } })
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

  // ====== USER SELF-SERVICE 2FA ======

  /**
   * STEP 1: User tự bật 2FA — lấy QR code và setupToken
   * POST /auth/2fa/me/enable/initiate
   * Yêu cầu: đã đăng nhập (JWT), body: { password }
   */
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('2fa/me/enable/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateMyEnable2FA(
    @User() user: any,
    @Body() dto: InitiateEnable2FADto,
  ) {
    const result = await this.twoFactorAuthService.initiateUserEnable2FA(user.id, user.email, dto.password);

    return {
      success: true,
      secret: result.secret,
      qrCode: result.qrCode,
      setupToken: result.setupToken,
      message: 'Quét mã QR bằng ứng dụng Authenticator rồi gọi confirm để hoàn tất.',
    };
  }

  /**
   * STEP 2: User xác nhận bật 2FA — verify TOTP, lưu DB, nhận backup codes
   * POST /auth/2fa/me/enable/confirm
   * Yêu cầu: setupToken trong Authorization header, body: { secret, code }
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @UseGuards(TwoFactorSetupGuard)
  @Post('2fa/me/enable/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmMyEnable2FA(
    @User() user: any,
    @Body() dto: ConfirmEnable2FADto,
  ) {
    if (!user.totpSecret) {
      throw new BadRequestException('Setup token không chứa secret. Vui lòng bắt đầu lại từ bước initiate.');
    }

    if (dto.secret !== user.totpSecret) {
      throw new BadRequestException('Secret không khớp với setup token.');
    }

    const { backupCodes } = await this.twoFactorAuthService.confirmUserEnable2FA(user.userId, dto.secret, dto.code);

    return {
      success: true,
      backupCodes,
      message: '2FA đã được bật thành công! Lưu các mã backup ở nơi an toàn.',
      warning: 'Nếu mất thiết bị Authenticator, bạn sẽ cần các mã backup này để đăng nhập.',
    };
  }

  /**
   * User tự tắt 2FA (chỉ khi không bị admin bắt buộc)
   * POST /auth/2fa/me/disable
   * Yêu cầu: đã đăng nhập (JWT), body: { password, totpCode }
   */
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('2fa/me/disable')
  @HttpCode(HttpStatus.OK)
  async disableMy2FA(
    @User() user: any,
    @Body() dto: Disable2FADto,
  ) {
    await this.twoFactorAuthService.userDisable2FA(user.id, dto.password, dto.totpCode);

    return {
      success: true,
      message: '2FA đã được tắt. Tài khoản của bạn sẽ đăng nhập trực tiếp bằng email và mật khẩu.',
    };
  }

  /**
   * Lấy trạng thái 2FA của chính mình
   * GET /auth/2fa/me/status
   * Yêu cầu: đã đăng nhập (JWT)
   */
  @SkipThrottle()
  @Get('2fa/me/status')
  async getMy2FAStatus(@User() user: any) {
    const status = await this.twoFactorAuthService.getTwoFactorStatus(user.id);

    return {
      twoFactorEnabled: status.enabled,
      twoFactorRequired: status.required,
      backupCodesRemaining: status.backupCodesRemaining,
    };
  }

  /**
   * ADMIN ENDPOINTS: Reset user's 2FA (includes audit log + email notification)
   * POST /auth/2fa/admin/reset/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('2fa/admin/reset/:userId')
  @HttpCode(HttpStatus.OK)
  async adminResetTwoFactor(
    @Param('userId') userId: string,
    @Body() dto: AdminResetTwoFactorDto,
    @User() adminUser: any,
  ) {
    this.logger.log(`Admin ${adminUser.email} is resetting 2FA for user ${userId}. Reason: ${dto.reason || 'Not provided'}`);

    // Disable 2FA for user
    await this.twoFactorAuthService.disableTwoFactor(userId, `Admin reset by ${adminUser.email}: ${dto.reason || 'No reason provided'}`);

    // Send notification email to user
    const userData = await this.authService.getProfile(userId);
    if (userData) {
      void this.emailService.sendAdminResetNotification(userData.email, userData.fullName || undefined).catch((error) => {
        this.logger.error('Failed to send admin reset notification in background', error instanceof Error ? error.stack : undefined);
      });
    }

    return {
      success: true,
      message: `2FA của user ${userId} đã được reset. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  /**
   * ADMIN ENDPOINTS: Enforce 2FA requirement for user
   * POST /auth/2fa/admin/require/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('2fa/admin/require/:userId')
  @HttpCode(HttpStatus.OK)
  async adminEnforceTwoFactorRequired(
    @Param('userId') userId: string,
    @User() adminUser: any,
  ) {
    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} không tồn tại`);
    }

    // Enforce 2FA requirement
    await this.twoFactorAuthService.setTwoFactorRequired(userId, true);

    this.logger.log(`Admin ${adminUser.email} enforced 2FA requirement for user ${userId}`);

    // Send notification email to user
    void this.emailService.sendTwoFactorEnforcedNotification(user.email, user.fullName || undefined).catch((error) => {
      this.logger.error('Failed to send 2FA enforcement notification', error instanceof Error ? error.stack : undefined);
    });

    return {
      success: true,
      message: `User ${userId} bắt buộc phải sử dụng 2FA. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  /**
   * ADMIN ENDPOINTS: Make 2FA optional for user
   * POST /auth/2fa/admin/unrequire/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 50 } })
  @Post('2fa/admin/unrequire/:userId')
  @HttpCode(HttpStatus.OK)
  async adminRemoveTwoFactorRequired(
    @Param('userId') userId: string,
    @User() adminUser: any,
  ) {
    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} không tồn tại`);
    }

    // Remove 2FA requirement (make it optional)
    await this.twoFactorAuthService.setTwoFactorRequired(userId, false);

    this.logger.log(`Admin ${adminUser.email} made 2FA optional for user ${userId}`);

    // Send notification email to user
    void this.emailService.sendTwoFactorOptionalNotification(user.email, user.fullName || undefined).catch((error) => {
      this.logger.error('Failed to send 2FA optional notification', error instanceof Error ? error.stack : undefined);
    });

    return {
      success: true,
      message: `User ${userId} không bắt buộc phải sử dụng 2FA nữa. User sẽ được thông báo via email.`,
      userNotified: true,
    };
  }

  /**
   * ADMIN ENDPOINTS: Get 2FA status for user
   * GET /auth/2fa/admin/status/:userId
   * Requires admin role
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @Get('2fa/admin/status/:userId')
  @HttpCode(HttpStatus.OK)
  async adminGetTwoFactorStatus(
    @Param('userId') userId: string,
  ) {
    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true, twoFactorRequired: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} không tồn tại`);
    }

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
}
