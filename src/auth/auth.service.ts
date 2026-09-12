import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from './services/email.service';
import { randomInt, randomUUID } from 'crypto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import {
  AuthSessionCacheService,
  CachedAuthUser,
} from './services/auth-session-cache.service';
import { TokenRevocationService } from './services/token-revocation.service';
import { isTokenRevokedBefore } from './token-issued-at';

type TokenUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatar: string | null;
  role: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type JwtTokenPayload = {
  sub: string;
  email: string;
  role: string;
  fullName: string | null;
  avatar: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  type: 'access' | 'refresh';
  jti: string;
  iat?: number;
  issuedAtMs?: number;
  exp?: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private twoFactorAuthService: TwoFactorAuthService,
    private readonly sessionCache: AuthSessionCacheService,
    private readonly tokenRevocation: TokenRevocationService,
  ) {}

  private get refreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    }
    return secret;
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        fullName: true,
        avatar: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        twoFactorRequired: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return null;
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException(
        'Tài khoản đang chờ admin phê duyệt. Vui lòng chờ thông báo qua email.',
      );
    }
    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException(
        'Tài khoản đã bị khóa. Vui lòng liên hệ admin.',
      );
    }

    const { password: passwordHash, ...result } = user;
    void passwordHash;
    return result;
  }

  async register(registerDto: RegisterDto) {
    const { email, password, fullName, avatar, phone } = registerDto;

    const [existingUser, existingPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { phone } }),
    ]);

    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng');
    }

    if (existingPhone) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới với status PENDING (chờ admin duyệt)
    const user = await this.prisma.createUserWithUniqueId((id) =>
      this.prisma.user.create({
        data: {
          id,
          email,
          fullName,
          password: hashedPassword,
          avatar,
          phone,
          status: 'PENDING',
          updatedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          phone: true,
          status: true,
          createdAt: true,
        },
      }),
    );

    return {
      message:
        'Đăng ký thành công. Tài khoản đang chờ admin phê duyệt, bạn sẽ nhận được email thông báo khi được duyệt.',
      user,
    };
  }

  async login(user: any) {
    const twoFactorEnabled = user.twoFactorEnabled || false;
    const twoFactorRequired = user.twoFactorRequired || false;

    if (twoFactorRequired && !twoFactorEnabled) {
      const setupToken = await this.twoFactorAuthService.generateSetupToken(
        user.id,
        user.email,
      );
      return {
        requiresTwoFactorSetup: true,
        setupToken,
        message: 'Bạn phải cài đặt xác thực 2 lớp (2FA) để tiếp tục.',
      };
    }

    if (twoFactorEnabled) {
      const verificationToken =
        await this.twoFactorAuthService.generateVerificationToken(
          user.id,
          user.email,
        );
      return {
        requiresTwoFactorVerification: true,
        verificationToken,
        message: 'Vui lòng xác nhận 2FA để hoàn tất đăng nhập.',
      };
    }

    return {
      requiresTwoFactorSetup: false,
      requiresTwoFactorVerification: false,
      skipTwoFactor: true,
    };
  }

  /**
   * Generate access and refresh tokens after successful 2FA verification
   */
  async generateTokensAfterTwoFactorVerification(userId: string): Promise<{
    access_token: string;
    refresh_token: string;
    user: any;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    this.assertUserActive(user.status);

    const tokens = await this.issueTokenPair(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      });

      if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      if (await this.tokenRevocation.isRevoked(payload.jti)) {
        throw new UnauthorizedException('Refresh token đã bị thu hồi');
      }

      const revokedBefore = await this.sessionCache.getRevokedBefore(
        payload.sub,
      );
      if (isTokenRevokedBefore(payload, revokedBefore)) {
        throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }
      this.assertUserActive(user.status);

      // Rotate: revoke current refresh jti before issuing a new pair.
      const expMs = payload.exp
        ? payload.exp * 1000
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
      await this.tokenRevocation.revoke(payload.jti, new Date(expMs));

      const tokens = await this.issueTokenPair(user);

      return {
        ...tokens,
        user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  async revokeTokenPair(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<void> {
    await Promise.all([
      this.revokeIfPresent(accessToken, 'access'),
      this.revokeIfPresent(refreshToken, 'refresh'),
    ]);
  }

  private async revokeIfPresent(
    token: string | undefined,
    kind: 'access' | 'refresh',
  ): Promise<void> {
    if (!token) return;
    try {
      const secret =
        kind === 'refresh'
          ? this.refreshSecret
          : this.configService.get<string>('JWT_SECRET')?.trim();
      const payload = this.jwtService.verify<JwtTokenPayload>(token, {
        ignoreExpiration: true,
        secret,
      });
      if (!payload.jti) return;
      const expMs = payload.exp
        ? payload.exp * 1000
        : Date.now() + 60 * 60 * 1000;
      await this.tokenRevocation.revoke(
        payload.jti,
        new Date(Math.max(expMs, Date.now())),
      );
    } catch {
      // Ignore malformed cookies on logout.
    }
  }

  async getProfile(ID: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ID },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true, // Thêm role
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    return user;
  }

  /**
   * Bước 1: Gửi OTP đến email mới để xác nhận đổi email
   */
  async requestEmailChange(userId: string, dto: RequestEmailChangeDto) {
    const { newEmail } = dto;

    const [currentUser, emailTaken] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true },
      }),
      this.prisma.user.findUnique({ where: { email: newEmail } }),
    ]);

    if (!currentUser) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (currentUser.email === newEmail) {
      throw new BadRequestException('Email mới phải khác email hiện tại');
    }

    if (emailTaken) {
      throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
    }

    // Xóa OTP cũ chưa dùng (dùng key riêng để phân biệt với forgot-password)
    await this.prisma.passwordReset.deleteMany({
      where: { email: `change_email:${userId}:${newEmail}`, isUsed: false },
    });

    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.passwordReset.create({
      data: {
        id: randomUUID(),
        email: `change_email:${userId}:${newEmail}`,
        otp: otpHash,
        expiresAt,
        isUsed: false,
      },
    });

    void this.emailService
      .sendChangeEmailOtp(newEmail, otp, currentUser.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send change-email OTP in background',
          error instanceof Error ? error.stack : undefined,
        );
      });

    return {
      message: `Mã OTP đang được gửi đến ${newEmail}. Vui lòng kiểm tra hộp thư.`,
      expiresIn: '15 phút',
    };
  }

  /**
   * Bước 2: Xác nhận OTP và cập nhật email mới
   */
  async confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto) {
    const { newEmail, otp } = dto;

    const candidates = await this.prisma.passwordReset.findMany({
      where: {
        email: `change_email:${userId}:${newEmail}`,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let record = null as (typeof candidates)[number] | null;
    for (const row of candidates) {
      if (await bcrypt.compare(otp, row.otp)) {
        record = row;
        break;
      }
    }

    if (!record) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }

    // Kiểm tra lần cuối email chưa bị đăng ký bởi ai khác trong lúc chờ
    const emailTaken = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (emailTaken) {
      throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail, updatedAt: new Date() },
      }),
      this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { isUsed: true },
      }),
    ]);

    await this.sessionCache.invalidateUser(userId);

    return { message: 'Cập nhật email thành công.' };
  }

  private generateOTP(): string {
    return randomInt(100000, 1000000).toString();
  }

  private assertUserActive(status: string): void {
    if (status === 'PENDING') {
      throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
    }
    if (status === 'BLOCKED') {
      throw new UnauthorizedException(
        'Tài khoản đã bị khóa. Vui lòng liên hệ admin.',
      );
    }
  }

  /**
   * Xử lý quên mật khẩu - Gửi OTP qua email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    // Tìm user theo email — không throw 404 để tránh lộ thông tin email tồn tại hay không
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    // Luôn trả về response thành công dù email có tồn tại hay không
    const genericResponse = {
      message:
        'Nếu email tồn tại trong hệ thống, mã OTP sẽ được gửi đến hộp thư của bạn.',
      expiresIn: '15 phút',
    };

    if (!user) {
      return genericResponse;
    }

    // Xóa các OTP cũ chưa sử dụng của email này
    await this.prisma.passwordReset.deleteMany({
      where: {
        email,
        isUsed: false,
      },
    });

    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.passwordReset.create({
      data: {
        id: randomUUID(),
        email,
        otp: otpHash,
        expiresAt,
        isUsed: false,
      },
    });

    void this.emailService
      .sendResetPasswordEmail(email, otp, user.fullName || undefined)
      .catch((error) => {
        this.logger.error(
          'Failed to send reset-password OTP in background',
          error instanceof Error ? error.stack : undefined,
        );
      });

    return genericResponse;
  }

  /**
   * Đặt lại mật khẩu với OTP
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    const candidates = await this.prisma.passwordReset.findMany({
      where: {
        email,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let passwordReset = null as (typeof candidates)[number] | null;
    for (const row of candidates) {
      if (await bcrypt.compare(otp, row.otp)) {
        passwordReset = row;
        break;
      }
    }

    if (!passwordReset) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const marked = await this.prisma.passwordReset.updateMany({
      where: { id: passwordReset.id, isUsed: false },
      data: { isUsed: true },
    });
    if (marked.count !== 1) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }

    await this.prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    await this.sessionCache.setRevokedBefore(user.id);
    await this.sessionCache.invalidateUser(user.id);

    return {
      message:
        'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  private async issueTokenPair(user: TokenUser): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const issuedAtMs = Date.now();
    const cachedUser = this.toCachedAuthUser(user);
    await this.sessionCache.setUser(cachedUser);

    const base = {
      issuedAtMs,
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      avatar: user.avatar,
      status: user.status,
      createdAt: cachedUser.createdAt.toISOString(),
      updatedAt: cachedUser.updatedAt.toISOString(),
    };

    return {
      access_token: this.jwtService.sign(
        { ...base, type: 'access', jti: randomUUID() },
        { expiresIn: '60m' },
      ),
      refresh_token: this.jwtService.sign(
        { ...base, type: 'refresh', jti: randomUUID() },
        { secret: this.refreshSecret, expiresIn: '7d' },
      ),
    };
  }

  private toCachedAuthUser(user: TokenUser): CachedAuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }
}
