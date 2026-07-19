import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import {
  AuthSessionCacheService,
  CachedAuthUser,
} from '../services/auth-session-cache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
    private readonly sessionCache: AuthSessionCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.access_token;
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: any) {
    try {
      this.logger.debug(`JWT payload received for user_id=${payload?.sub ?? 'unknown'}`);

      const token = request?.cookies?.access_token;
      const userId = payload?.sub as string | undefined;

      if (!userId) {
        throw new UnauthorizedException('Token không hợp lệ');
      }

      // Run blacklist + user resolution concurrently on cache miss to cut RTT wait.
      const [isBlacklisted, user] = await Promise.all([
        token ? this.tokenBlacklistService.isBlacklisted(token) : Promise.resolve(false),
        this.resolveUser(userId),
      ]);

      if (isBlacklisted) {
        this.logger.warn(`Blacklisted JWT rejected for user_id=${userId}`);
        throw new UnauthorizedException('Token đã bị vô hiệu hóa. Vui lòng đăng nhập lại');
      }

      this.logger.debug(`JWT user lookup completed for user_id=${userId} found=${Boolean(user)}`);

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      if (user.status === 'PENDING') {
        throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
      }
      if (user.status === 'BLOCKED') {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      return user;
    } catch (error) {
      this.logger.error('JWT validation failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private async resolveUser(userId: string): Promise<CachedAuthUser | null> {
    const cached = this.sessionCache.getUser(userId);
    if (cached) {
      return cached;
    }

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
      return null;
    }

    this.sessionCache.setUser(user);
    return user;
  }
}
