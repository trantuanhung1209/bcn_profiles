import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthSessionCacheService } from './auth-session-cache.service';

@Injectable()
export class TokenBlacklistService implements OnModuleInit {
  private readonly logger = new Logger(TokenBlacklistService.name);

  /**
   * When true (default), unknown tokens are treated as not-blacklisted without a DB
   * round-trip. Persisted blacklist rows are loaded on boot; logout still writes DB
   * + memory so the current process stays correct immediately.
   */
  private readonly trustMemoryMisses =
    (process.env.AUTH_BLACKLIST_TRUST_MEMORY ?? 'true').toLowerCase() !== 'false';

  constructor(
    private prisma: PrismaService,
    private readonly sessionCache: AuthSessionCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.preloadActiveBlacklist();
  }

  /**
   * Thêm token vào blacklist
   * @param token - Access token cần blacklist
   * @param expiresInHours - Thời gian hết hạn (mặc định 24h)
   */
  async addToBlacklist(token: string, expiresInHours: number = 24): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    const ttlMs = Math.max(expiresAt.getTime() - Date.now(), 1_000);

    // Cache first so subsequent requests on this process deny immediately.
    this.sessionCache.markBlacklisted(token, ttlMs);

    await this.prisma.tokenBlacklist.create({
      data: {
        token,
        expiresAt,
      },
    });

    this.logger.log(`Token added to blacklist, expires at: ${expiresAt.toISOString()}`);
  }

  /**
   * Kiểm tra token có trong blacklist không
   * @param token - Token cần kiểm tra
   * @returns true nếu token bị blacklist
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const cached = this.sessionCache.getBlacklistState(token);
    if (cached !== undefined) {
      return cached;
    }

    if (this.trustMemoryMisses) {
      // Fast path for first request after login: avoid DigitalOcean RTT.
      this.sessionCache.markNotBlacklisted(token);
      return false;
    }

    const blacklistedToken = await this.prisma.tokenBlacklist.findUnique({
      where: { token },
      select: { expiresAt: true },
    });

    if (blacklistedToken) {
      const ttlMs = blacklistedToken.expiresAt.getTime() - Date.now();
      if (ttlMs > 0) {
        this.sessionCache.markBlacklisted(token, ttlMs);
        return true;
      }

      await this.prisma.tokenBlacklist.delete({
        where: { token },
      });
    }

    this.sessionCache.markNotBlacklisted(token);
    return false;
  }

  async preloadActiveBlacklist(): Promise<void> {
    try {
      const now = new Date();
      const rows = await this.prisma.tokenBlacklist.findMany({
        where: { expiresAt: { gt: now } },
        select: { token: true, expiresAt: true },
      });

      for (const row of rows) {
        this.sessionCache.markBlacklisted(
          row.token,
          Math.max(row.expiresAt.getTime() - Date.now(), 1_000),
        );
      }

      this.logger.log(`Preloaded ${rows.length} active blacklist token(s) into memory`);
    } catch (error) {
      this.logger.error(
        'Failed to preload token blacklist',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Xóa các token đã hết hạn khỏi blacklist
   * Chạy tự động mỗi 1 giờ
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredTokens(): Promise<void> {
    const result = await this.prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.sessionCache.clearBlacklist();
    await this.preloadActiveBlacklist();
    this.logger.log(`Cleaned up ${result.count} expired tokens from blacklist`);
  }

  /**
   * Xóa thủ công tất cả token đã hết hạn
   */
  async manualCleanup(): Promise<number> {
    const result = await this.prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.sessionCache.clearBlacklist();
    await this.preloadActiveBlacklist();
    return result.count;
  }
}
