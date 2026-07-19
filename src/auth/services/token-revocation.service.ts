import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TtlCache } from '../../common/cache/ttl-cache';

@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);
  /** Hot path: avoid DB on every request after first revoke lookup. */
  private readonly revoked = new TtlCache<true>(7 * 24 * 60 * 60 * 1000);

  constructor(private readonly prisma: PrismaService) {}

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    if (!jti) return;
    this.revoked.set(jti, true);
    try {
      await this.prisma.tokenBlacklist.upsert({
        where: { token: jti },
        create: { token: jti, expiresAt },
        update: { expiresAt },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist revoked jti: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async isRevoked(jti?: string): Promise<boolean> {
    if (!jti) return false;
    if (this.revoked.get(jti)) return true;

    const row = await this.prisma.tokenBlacklist.findUnique({
      where: { token: jti },
      select: { expiresAt: true },
    });
    if (!row) return false;
    if (row.expiresAt.getTime() <= Date.now()) {
      return false;
    }
    this.revoked.set(jti, true);
    return true;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    try {
      await this.prisma.tokenBlacklist.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await this.prisma.authChallenge.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to purge expired auth tokens: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
