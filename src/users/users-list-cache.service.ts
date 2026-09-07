import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type CachedUsersPage = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class UsersListCacheService {
  private readonly ttlMs: number;

  constructor(private readonly redis: RedisService) {
    const raw = Number(process.env.USERS_LIST_CACHE_TTL_MS ?? 60_000);
    this.ttlMs = Number.isFinite(raw) && raw > 0 ? raw : 60_000;
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

  private pageKey(key: string): string {
    return `users:page:${key}`;
  }

  private detailKey(id: string): string {
    return `users:detail:${id}`;
  }

  private profileKey(id: string): string {
    return `users:profile:${id}`;
  }

  private emailKey(email: string): string {
    return `users:email:${email.trim().toLowerCase()}`;
  }

  private searchKey(query: string): string {
    return `users:search:${query.trim().toLowerCase()}`;
  }

  private countKey(): string {
    return 'users:count:all';
  }

  async getPage(key: string): Promise<CachedUsersPage | undefined> {
    return this.redis.getJson<CachedUsersPage>(this.pageKey(key));
  }

  async setPage(key: string, value: CachedUsersPage): Promise<void> {
    await this.redis.setJson(this.pageKey(key), value, this.ttlMs);
  }

  async getDetail(id: string): Promise<unknown | undefined> {
    return this.redis.getJson(this.detailKey(id));
  }

  async setDetail(id: string, value: unknown): Promise<void> {
    await this.redis.setJson(this.detailKey(id), value, this.ttlMs);
  }

  async getProfile(id: string): Promise<unknown | undefined> {
    return this.redis.getJson(this.profileKey(id));
  }

  async setProfile(id: string, value: unknown): Promise<void> {
    await this.redis.setJson(this.profileKey(id), value, this.ttlMs);
  }

  async getByEmail(email: string): Promise<unknown | undefined> {
    return this.redis.getJson(this.emailKey(email));
  }

  async setByEmail(email: string, value: unknown): Promise<void> {
    await this.redis.setJson(this.emailKey(email), value, this.ttlMs);
  }

  async getSearch(query: string): Promise<unknown | undefined> {
    return this.redis.getJson(this.searchKey(query));
  }

  async setSearch(query: string, value: unknown): Promise<void> {
    await this.redis.setJson(this.searchKey(query), value, this.ttlMs);
  }

  async getCount(): Promise<number | undefined> {
    const raw = await this.redis.get(this.countKey());
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  async setCount(value: number): Promise<void> {
    await this.redis.set(this.countKey(), String(value), this.ttlMs);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.delByPrefix('users:');
  }
}
