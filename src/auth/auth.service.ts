import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from './services/email.service';
import { randomUUID } from 'crypto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { TwoFactorAuthService } from './services/two-factor-auth.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private twoFactorAuthService: TwoFactorAuthService,
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
      return null;
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt. Vui lòng chờ thông báo qua email.');
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
      message: 'Đăng ký thành công. Tài khoản đang chờ admin phê duyệt, bạn sẽ nhận được email thông báo khi được duyệt.',
      user,
    };
  }

  async login(user: any) {
    // Check 2FA status
    const twoFactorEnabled = user.twoFactorEnabled || false;

    if (!twoFactorEnabled) {
      // 2FA not enabled - force user to setup 2FA
      const setupToken = this.twoFactorAuthService.generateSetupToken(user.id, user.email);
      return {
        requiresTwoFactorSetup: true,
        setupToken,
        message: 'Bạn phải cài đặt xác thực 2 lớp (2FA) để tiếp tục.',
      };
    }

    // 2FA is enabled - require verification
    const verificationToken = this.twoFactorAuthService.generateVerificationToken(user.id, user.email);
    return {
      requiresTwoFactorVerification: true,
      verificationToken,
      message: 'Vui lòng xác nhận 2FA để hoàn tất đăng nhập.',
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
      },
    });

    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '60m',
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      access_token,
      refresh_token,
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
      // Xác thực refresh token
      const payload = this.jwtService.verify(refreshToken);
      
      // Kiểm tra user còn tồn tại
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          role: true,
          status: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      if (user.status === 'PENDING') {
        throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
      }
      if (user.status === 'BLOCKED') {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      // Tạo tokens mới
      const newPayload = { 
        email: user.email, 
        sub: user.id,
        role: user.role, // Thêm role vào payload mới
      };
      
      const access_token = this.jwtService.sign(newPayload, {
        expiresIn: '60m',
      });

      const refresh_token = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

      return {
        access_token,
        refresh_token,
        user,
      };
    } catch (error) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
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

    await this.prisma.passwordReset.create({
      data: {
        id: randomUUID(),
        email: `change_email:${userId}:${newEmail}`,
        otp,
        expiresAt,
        isUsed: false,
      },
    });

    void this.emailService.sendChangeEmailOtp(newEmail, otp, currentUser.fullName || undefined).catch((error) => {
      console.error('Failed to send change-email OTP in background:', error);
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

    return { message: 'Cập nhật email thành công.' };
  }

  /**
   * Tạo mã OTP ngẫu nhiên 6 chữ số
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Xử lý quên mật khẩu - Gửi OTP qua email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    // Kiểm tra xem email có tồn tại trong hệ thống không
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Email không tồn tại trong hệ thống');
    }

    // Xóa các OTP cũ chưa sử dụng của email này
    await this.prisma.passwordReset.deleteMany({
      where: {
        email,
        isUsed: false,
      },
    });

    // Tạo OTP mới
    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // OTP hết hạn sau 15 phút

    // Lưu OTP vào database
    await this.prisma.passwordReset.create({
      data: {
        id: randomUUID(),
        email,
        otp,
        expiresAt,
        isUsed: false,
      },
    });

    // Dispatch mail sending in background to keep API response time low.
    void this.emailService.sendResetPasswordEmail(email, otp, user.fullName || undefined).catch((error) => {
      console.error('Failed to send reset-password OTP in background:', error);
    });

    return {
      message: 'Mã OTP đang được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.',
      expiresIn: '15 phút',
    };
  }

  /**
   * Đặt lại mật khẩu với OTP
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    // Tìm OTP trong database
    const passwordReset = await this.prisma.passwordReset.findFirst({
      where: {
        email,
        otp,
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!passwordReset) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã được sử dụng');
    }

    // Kiểm tra OTP có hết hạn chưa
    if (new Date() > passwordReset.expiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    // Kiểm tra user có tồn tại không
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu mới và đánh dấu OTP đã sử dụng
    await this.prisma.$transaction([
      // Cập nhật mật khẩu mới
      this.prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      }),
      // Đánh dấu OTP đã sử dụng
      this.prisma.passwordReset.update({
        where: { id: passwordReset.id },
        data: { isUsed: true },
      }),
    ]);

    return {
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  /**
   * Xử lý đăng nhập bằng Google OAuth
   */
  async googleLogin(googleUser: any) {
    const { googleId, email, fullName, avatar } = googleUser;

    // Tìm user theo email
    let user = await this.prisma.user.findUnique({
      where: { email },
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

    // Nếu user chưa tồn tại, tạo mới với status PENDING
    if (!user) {
      user = await this.prisma.createUserWithUniqueId((id) =>
        this.prisma.user.create({
          data: {
            id,
            email,
            fullName,
            avatar,
            password: null,
            status: 'PENDING',
            updatedAt: new Date(),
          },
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
        }),
      );

      throw new UnauthorizedException('Tài khoản mới đã được tạo và đang chờ admin phê duyệt. Bạn sẽ nhận được email thông báo khi được duyệt.');
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt. Vui lòng chờ thông báo qua email.');
    }
    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
    }

    // Tạo JWT tokens
    const payload = { 
      email: user.email, 
      sub: user.id,
      role: user.role,
    };
    
    const access_token = this.jwtService.sign(payload, {
      expiresIn: '60m',
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });
    
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
      },
    };
  }
}
