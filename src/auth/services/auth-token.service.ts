import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthSessionCacheService,
  CachedAuthUser,
} from './auth-session-cache.service';
import { TokenRevocationService } from './token-revocation.service';

export type TokenUser = {
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
  exp?: number;
};

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sessionCache: AuthSessionCacheService,
    private readonly tokenRevocation: TokenRevocationService,
  ) {}

  async issueSessionForUserId(userId: string): Promise<{
    access_token: string;
    refresh_token: string;
    user: {
      id: string;
      email: string;
      fullName: string | null;
      avatar: string | null;
      role: string;
    };
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

    const tokens = this.issueTokenPair(user);
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
      const payload = this.jwtService.verify(refreshToken) as Partial<JwtTokenPayload>;

      if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      if (await this.tokenRevocation.isRevoked(payload.jti)) {
        throw new UnauthorizedException('Refresh token đã bị thu hồi');
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

      const expMs = payload.exp
        ? payload.exp * 1000
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
      await this.tokenRevocation.revoke(payload.jti, new Date(expMs));

      return {
        ...this.issueTokenPair(user),
        user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  async revokeTokenPair(accessToken?: string, refreshToken?: string): Promise<void> {
    await Promise.all([
      this.revokeIfPresent(accessToken),
      this.revokeIfPresent(refreshToken),
    ]);
  }

  issueTokenPair(user: TokenUser): {
    access_token: string;
    refresh_token: string;
  } {
    const cachedUser = this.toCachedAuthUser(user);
    this.sessionCache.setUser(cachedUser);

    const base = {
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
        { expiresIn: '7d' },
      ),
    };
  }

  assertUserActive(status: string): void {
    if (status === 'PENDING') {
      throw new UnauthorizedException('Tài khoản đang chờ admin phê duyệt.');
    }
    if (status === 'BLOCKED') {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
    }
  }

  private async revokeIfPresent(token?: string): Promise<void> {
    if (!token) return;
    try {
      const payload = this.jwtService.verify(token, {
        ignoreExpiration: true,
      }) as Partial<JwtTokenPayload>;
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
