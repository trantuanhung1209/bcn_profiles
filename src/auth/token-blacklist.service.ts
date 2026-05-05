import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Thêm token vào blacklist
   * @param token - Access token cần blacklist
   * @param expiresInHours - Thời gian hết hạn (mặc định 24h)
   */
  async addToBlacklist(token: string, expiresInHours: number = 24): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

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
    const blacklistedToken = await this.prisma.tokenBlacklist.findUnique({
      where: { token },
    });

    // Nếu tìm thấy và chưa hết hạn
    if (blacklistedToken) {
      if (new Date() < blacklistedToken.expiresAt) {
        return true;
      } else {
        // Token đã hết hạn, xóa luôn
        await this.prisma.tokenBlacklist.delete({
          where: { token },
        });
      }
    }

    return false;
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
          lt: new Date(), // Xóa các token có expiresAt < hiện tại
        },
      },
    });

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

    return result.count;
  }
}
