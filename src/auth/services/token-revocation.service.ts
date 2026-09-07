import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);
  private readonly hotTtlMs = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private key(jti: string): string {
    return `auth:revoked:${jti}`;
  }

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    if (!jti) return;

    const ttl = Math.max(expiresAt.getTime() - Date.now(), 60_000);
    await this.redis.set(this.key(jti), '1', Math.min(ttl, this.hotTtlMs));

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

    const hot = await this.redis.get(this.key(jti));
    if (hot) return true;

    const row = await this.prisma.tokenBlacklist.findUnique({
      where: { token: jti },
      select: { expiresAt: true },
    });
    if (!row) return false;
    if (row.expiresAt.getTime() <= Date.now()) {
      return false;
    }

    const ttl = Math.max(row.expiresAt.getTime() - Date.now(), 60_000);
    await this.redis.set(this.key(jti), '1', Math.min(ttl, this.hotTtlMs));
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
