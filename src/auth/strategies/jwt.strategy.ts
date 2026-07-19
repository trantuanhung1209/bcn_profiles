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

type AccessTokenPayload = {
  sub?: string;
  email?: string;
  role?: string;
  fullName?: string | null;
  avatar?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

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

  async validate(request: Request, payload: AccessTokenPayload) {
    try {
      this.logger.debug(`JWT payload received for user_id=${payload?.sub ?? 'unknown'}`);

      const token = request?.cookies?.access_token;
      const userId = payload?.sub;

      if (!userId) {
        throw new UnauthorizedException('Token không hợp lệ');
      }

      if (token && (await this.tokenBlacklistService.isBlacklisted(token))) {
        this.logger.warn(`Blacklisted JWT rejected for user_id=${userId}`);
        throw new UnauthorizedException('Token đã bị vô hiệu hóa. Vui lòng đăng nhập lại');
      }

      const user = await this.resolveUser(userId, payload);
      this.logger.debug(`JWT user resolved for user_id=${userId} found=${Boolean(user)}`);

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      const effectiveStatus = this.sessionCache.getStatusOverride(userId) ?? user.status;
      if (effectiveStatus === 'PENDING') {
        throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
      }
      if (effectiveStatus === 'BLOCKED') {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      return { ...user, status: effectiveStatus };
    } catch (error) {
      this.logger.error('JWT validation failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private async resolveUser(
    userId: string,
    payload: AccessTokenPayload,
  ): Promise<CachedAuthUser | null> {
    const cached = this.sessionCache.getUser(userId);
    if (cached) {
      return cached;
    }

    const fromToken = this.userFromAccessToken(payload);
    if (fromToken) {
      this.sessionCache.setUser(fromToken);
      return fromToken;
    }

    // Backward-compat for older tokens that only had sub/email/role.
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

  private userFromAccessToken(payload: AccessTokenPayload): CachedAuthUser | null {
    if (!payload.sub || !payload.email || !payload.role || !payload.status) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName ?? null,
      avatar: payload.avatar ?? null,
      role: payload.role,
      status: payload.status,
      createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(0),
      updatedAt: payload.updatedAt ? new Date(payload.updatedAt) : new Date(0),
    };
  }
}
