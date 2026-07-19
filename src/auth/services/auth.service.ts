import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { RegisterDto } from '../dto/register.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RequestEmailChangeDto } from '../dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { EmailService } from './email.service';
import { TwoFactorAuthService } from './two-factor-auth.service';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly twoFactorAuthService: TwoFactorAuthService,
    private readonly authTokenService: AuthTokenService,
  ) {}

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

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return null;
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException(
        'Tài khoản đang chờ admin phê duyệt. Vui lòng chờ thông báo qua email.',
      );
    }
    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
    }

    const { password: _, ...result } = user;
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

    const hashedPassword = await bcrypt.hash(password, 10);
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

  /** Decide which post-password login branch the client should take. */
  async login(user: any) {
    const twoFactorEnabled = user.twoFactorEnabled || false;
    const twoFactorRequired = user.twoFactorRequired || false;

    if (twoFactorRequired && !twoFactorEnabled) {
      return {
        requiresTwoFactorSetup: true,
        setupToken: await this.twoFactorAuthService.generateSetupToken(user.id, user.email),
        message: 'Bạn phải cài đặt xác thực 2 lớp (2FA) để tiếp tục.',
      };
    }

    if (twoFactorEnabled) {
      return {
        requiresTwoFactorVerification: true,
        verificationToken: await this.twoFactorAuthService.generateVerificationToken(
          user.id,
          user.email,
        ),
        message: 'Vui lòng xác nhận 2FA để hoàn tất đăng nhập.',
      };
    }

    return {
      requiresTwoFactorSetup: false,
      requiresTwoFactorVerification: false,
      skipTwoFactor: true,
    };
  }

  generateTokensAfterTwoFactorVerification(userId: string) {
    return this.authTokenService.issueSessionForUserId(userId);
  }

  refreshTokens(refreshToken: string) {
    return this.authTokenService.refreshTokens(refreshToken);
  }

  revokeTokenPair(accessToken?: string, refreshToken?: string) {
    return this.authTokenService.revokeTokenPair(accessToken, refreshToken);
  }

  async getProfile(ID: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ID },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    return user;
  }

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

    await this.prisma.passwordReset.deleteMany({
      where: { email: `change_email:${userId}:${newEmail}`, isUsed: false },
    });

    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.prisma.passwordReset.create({
      data: {
        id: randomUUID(),
        email: `change_email:${userId}:${newEmail}`,
        otp,
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

  async confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto) {
    const { newEmail, otp } = dto;

    const record = await this.prisma.passwordReset.findFirst({
      where: {
        email: `change_email:${userId}:${newEmail}`,
        otp,
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }
    if (new Date() > record.expiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    const emailTaken = await this.prisma.user.findUnique({ where: { email: newEmail } });
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

    return { message: 'Cập nhật email thành công.' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const genericResponse = {
      message:
        'Nếu email tồn tại trong hệ thống, mã OTP sẽ được gửi đến hộp thư của bạn.',
      expiresIn: '15 phút',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) {
      return genericResponse;
    }

    await this.prisma.passwordReset.deleteMany({
      where: { email, isUsed: false },
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

    let passwordReset: (typeof candidates)[number] | null = null;
    for (const row of candidates) {
      if (row.otp === otp || (await bcrypt.compare(otp, row.otp))) {
        passwordReset = row;
        break;
      }
    }

    if (!passwordReset) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
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
      data: { password: hashedPassword, updatedAt: new Date() },
    });

    return {
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  private generateOTP(): string {
    return randomInt(100000, 1000000).toString();
  }
}
