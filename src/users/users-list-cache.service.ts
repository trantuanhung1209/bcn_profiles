import { Injectable } from '@nestjs/common';
import { TtlCache } from '../common/cache/ttl-cache';

export type CachedUsersPage = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class UsersListCacheService {
  private readonly cache: TtlCache<CachedUsersPage>;

  constructor() {
    const ttlMs = Number(process.env.USERS_LIST_CACHE_TTL_MS ?? 60_000);
    this.cache = new TtlCache<CachedUsersPage>(
      Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000,
    );
  }

  buildKey(parts: {
    scope: 'all' | 'pending';
    page: number;
    limit: number;
    sort: string;
    order: string;
    search?: string;
  }): string {
    const search = parts.search?.trim().toLowerCase() || '';
    return [
      parts.scope,
      parts.page,
      parts.limit,
      parts.sort,
      parts.order,
      search,
    ].join('|');
  }

  get(key: string): CachedUsersPage | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: CachedUsersPage): void {
    this.cache.set(key, value);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
