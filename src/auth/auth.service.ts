import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from './email.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
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
        role: true, // Lấy role từ database
        createdAt: true,
        updatedAt: true,
      },
    });

    if (user && user.password && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async register(registerDto: RegisterDto) {
    const { email, password, fullName, avatar } = registerDto;

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        fullName,
        password: hashedPassword,
        avatar,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        createdAt: true,
      },
    });

    return {
      message: 'Đăng ký thành công',
      user,
    };
  }

  async login(user: any) {
    const payload = { 
      email: user.email, 
      sub: user.id,
      role: user.role, // Thêm role vào JWT payload
    };
    
    // Tạo access token (thời gian ngắn)
    const access_token = this.jwtService.sign(payload, {
      expiresIn: '60m', // 60 phút
    });

    // Tạo refresh token (thời gian dài)
    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '7d', // 7 ngày
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
          role: true, // Lấy role
        },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
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

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    // Gửi email chứa OTP
    try {
      await this.emailService.sendResetPasswordEmail(email, otp, user.fullName || undefined);
      
      return {
        message: 'Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.',
        expiresIn: '15 phút',
      };
    } catch (error) {
      // Nếu gửi email thất bại, xóa OTP đã tạo
      await this.prisma.passwordReset.deleteMany({
        where: { email, otp },
      });
      throw new BadRequestException('Không thể gửi email. Vui lòng thử lại sau.');
    }
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
        createdAt: true,
        updatedAt: true,
      },
    });

    // Nếu user chưa tồn tại, tạo mới
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          fullName,
          avatar,
          password: null, // Google login không có password
          updatedAt: new Date(),
        },
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
