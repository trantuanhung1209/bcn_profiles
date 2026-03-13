import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Trích xuất JWT từ cookie
          const token = request?.cookies?.access_token;
          console.log('🔍 Cookies:', request?.cookies);
          console.log('🔑 Token extracted:', token);
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
      passReqToCallback: true, // Để có thể access request trong validate()
    });
  }

  async validate(request: Request, payload: any) {
    try {
      console.log('🎯 JWT Payload:', payload);
      
      // Lấy token từ cookie
      const token = request?.cookies?.access_token;
      
      // Kiểm tra token có trong blacklist không
      if (token) {
        const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
          console.log('🚫 Token is blacklisted');
          throw new UnauthorizedException('Token đã bị vô hiệu hóa. Vui lòng đăng nhập lại');
        }
      }
      
      // Kiểm tra xem user còn tồn tại không
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

      console.log('👤 User found:', user);

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      if (user.status === 'PENDING') {
        throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
      }
      if (user.status === 'BLOCKED') {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      // Return user với role để RolesGuard có thể check
      return user;
    } catch (error) {
      console.error('❌ Validation error:', error);
      throw error;
    }
  }
}
