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
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service';
import { AuthCookiesService } from '../services/auth-cookies.service';
import { User } from '../decorators/user.decorator';
import { Public } from '../decorators/public.decorator';
import { RegisterDto } from '../dto/register.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RequestEmailChangeDto } from '../dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookies: AuthCookiesService,
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

    if (result.requiresTwoFactorSetup) {
      return {
        requiresTwoFactorSetup: true,
        setupToken: result.setupToken,
        message: result.message,
      };
    }

    if (result.requiresTwoFactorVerification) {
      return {
        requiresTwoFactorVerification: true,
        verificationToken: result.verificationToken,
        message: result.message,
      };
    }

    if (result.skipTwoFactor) {
      const tokens = await this.authService.generateTokensAfterTwoFactorVerification(user.id);
      this.authCookies.setAuthCookies(response, tokens);
      return {
        message: 'Đăng nhập thành công (2FA không bắt buộc)',
        user: tokens.user,
        skipTwoFactor: true,
      };
    }

    throw new BadRequestException('Unexpected login flow');
  }

  @Get('profile')
  async getProfile(@User() user: any) {
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
    await this.authService.revokeTokenPair(
      response.req.cookies?.access_token,
      response.req.cookies?.refresh_token,
    );
    this.authCookies.clearAuthCookies(response);
    return { message: 'Đăng xuất thành công' };
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Res({ passthrough: true }) response: Response) {
    const refreshToken = response.req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không tồn tại');
    }

    const result = await this.authService.refreshTokens(refreshToken);
    this.authCookies.setAuthCookies(response, result);
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
}
