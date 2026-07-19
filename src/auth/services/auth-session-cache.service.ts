import { Injectable } from '@nestjs/common';
import { TtlCache } from '../../common/cache/ttl-cache';

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

@Injectable()
export class AuthSessionCacheService {
  /** Status/role can change; keep short so profile edits refresh reasonably fast. */
  private readonly userCache = new TtlCache<CachedAuthUser>(30_000);

  /**
   * Admin status changes must win over JWT claims even before access token expires.
   * Kept for a long TTL (or until overwritten).
   */
  private readonly statusOverrides = new TtlCache<string>(24 * 60 * 60 * 1000);

  /** Negative blacklist lookups; positive entries use token remaining TTL. */
  private readonly blacklistMissCache = new TtlCache<true>(30_000);
  private readonly blacklistHitCache = new TtlCache<true>(24 * 60 * 60 * 1000);

  getUser(userId: string): CachedAuthUser | undefined {
    return this.userCache.get(userId);
  }

  setUser(user: CachedAuthUser): void {
    this.userCache.set(user.id, user);
  }

  invalidateUser(userId: string): void {
    this.userCache.delete(userId);
  }

  setStatusOverride(userId: string, status: string): void {
    this.statusOverrides.set(userId, status);
    const cached = this.userCache.get(userId);
    if (cached) {
      this.userCache.set(userId, { ...cached, status });
    }
  }

  getStatusOverride(userId: string): string | undefined {
    return this.statusOverrides.get(userId);
  }

  getBlacklistState(token: string): boolean | undefined {
    if (this.blacklistHitCache.get(token)) {
      return true;
    }
    if (this.blacklistMissCache.get(token)) {
      return false;
    }
    return undefined;
  }

  markBlacklisted(token: string, ttlMs: number): void {
    this.blacklistMissCache.delete(token);
    this.blacklistHitCache.set(token, true, Math.max(ttlMs, 1_000));
  }

  markNotBlacklisted(token: string): void {
    this.blacklistHitCache.delete(token);
    this.blacklistMissCache.set(token, true);
  }

  clearBlacklist(): void {
    this.blacklistHitCache.clear();
    this.blacklistMissCache.clear();
  }
}
