import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export type CachedAuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatar: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const USER_TTL_MS = 30_000;
const REVOKED_BEFORE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthSessionCacheService {
  constructor(private readonly redis: RedisService) {}

  private userKey(userId: string): string {
    return `auth:user:${userId}`;
  }

  private revokedBeforeKey(userId: string): string {
    return `session:revoked_before:${userId}`;
  }

  async getUser(userId: string): Promise<CachedAuthUser | undefined> {
    const raw = await this.redis.getJson<{
      id: string;
      email: string;
      fullName: string | null;
      avatar: string | null;
      role: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>(this.userKey(userId));

    if (!raw) return undefined;

    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }

  async setUser(user: CachedAuthUser): Promise<void> {
    await this.redis.setJson(this.userKey(user.id), user, USER_TTL_MS);
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.del(this.userKey(userId));
  }

  /**
   * Kill all sessions issued before now (checked against JWT `iat`).
   */
  async setRevokedBefore(
    userId: string,
    atMs: number = Date.now(),
  ): Promise<void> {
    await this.redis.set(
      this.revokedBeforeKey(userId),
      String(atMs),
      REVOKED_BEFORE_TTL_MS,
    );
  }

  async getRevokedBefore(userId: string): Promise<number | undefined> {
    const raw = await this.redis.get(this.revokedBeforeKey(userId));
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
}
