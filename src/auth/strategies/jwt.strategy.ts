import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthSessionCacheService,
  CachedAuthUser,
} from '../services/auth-session-cache.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { isTokenRevokedBefore } from '../token-issued-at';

type AccessTokenPayload = {
  sub?: string;
  type?: string;
  jti?: string;
  iat?: number;
  issuedAtMs?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly sessionCache: AuthSessionCacheService,
    private readonly tokenRevocation: TokenRevocationService,
  ) {
    const secret = configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.access_token,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(_request: Request, payload: AccessTokenPayload) {
    try {
      const userId = payload?.sub;
      if (!userId) {
        throw new UnauthorizedException('Token không hợp lệ');
      }

      // Reject refresh / challenge tokens used as access tokens.
      if (payload.type && payload.type !== 'access') {
        throw new UnauthorizedException('Token không hợp lệ');
      }

      if (await this.tokenRevocation.isRevoked(payload.jti)) {
        throw new UnauthorizedException('Token đã bị thu hồi');
      }

      const revokedBefore = await this.sessionCache.getRevokedBefore(userId);
      if (isTokenRevokedBefore(payload, revokedBefore)) {
        throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');
      }

      const user = await this.resolveUser(userId);
      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      if (user.status === 'PENDING') {
        throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
      }
      if (user.status === 'BLOCKED') {
        throw new UnauthorizedException(
          'Tài khoản đã bị khóa. Vui lòng liên hệ admin.',
        );
      }

      return user;
    } catch (error) {
      this.logger.error(
        'JWT validation failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async resolveUser(userId: string): Promise<CachedAuthUser | null> {
    const cached = await this.sessionCache.getUser(userId);
    if (cached) {
      return cached;
    }

    // Always load authoritative role/status from DB — never trust JWT claims alone.
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

    await this.sessionCache.setUser(user);
    return user;
  }
}
