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
  private readonly pages: TtlCache<CachedUsersPage>;
  private readonly details: TtlCache<unknown>;
  private readonly profiles: TtlCache<unknown>;
  private readonly byEmail: TtlCache<unknown>;
  private readonly searches: TtlCache<unknown>;
  private readonly counts: TtlCache<number>;

  constructor() {
    const ttlMs = Number(process.env.USERS_LIST_CACHE_TTL_MS ?? 60_000);
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000;
    this.pages = new TtlCache<CachedUsersPage>(ttl);
    this.details = new TtlCache<unknown>(ttl);
    this.profiles = new TtlCache<unknown>(ttl);
    this.byEmail = new TtlCache<unknown>(ttl);
    this.searches = new TtlCache<unknown>(ttl);
    this.counts = new TtlCache<number>(ttl);
  }

  buildPageKey(parts: {
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

  getPage(key: string): CachedUsersPage | undefined {
    return this.pages.get(key);
  }

  setPage(key: string, value: CachedUsersPage): void {
    this.pages.set(key, value);
  }

  getDetail(id: string): unknown | undefined {
    return this.details.get(id);
  }

  setDetail(id: string, value: unknown): void {
    this.details.set(id, value);
  }

  getProfile(id: string): unknown | undefined {
    return this.profiles.get(id);
  }

  setProfile(id: string, value: unknown): void {
    this.profiles.set(id, value);
  }

  getByEmail(email: string): unknown | undefined {
    return this.byEmail.get(email.trim().toLowerCase());
  }

  setByEmail(email: string, value: unknown): void {
    this.byEmail.set(email.trim().toLowerCase(), value);
  }

  getSearch(query: string): unknown | undefined {
    return this.searches.get(query.trim().toLowerCase());
  }

  setSearch(query: string, value: unknown): void {
    this.searches.set(query.trim().toLowerCase(), value);
  }

  getCount(): number | undefined {
    return this.counts.get('all');
  }

  setCount(value: number): void {
    this.counts.set('all', value);
  }

  invalidateAll(): void {
    this.pages.clear();
    this.details.clear();
    this.profiles.clear();
    this.byEmail.clear();
    this.searches.clear();
    this.counts.clear();
  }
}
